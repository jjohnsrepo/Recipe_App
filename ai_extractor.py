import base64
import json
import mimetypes
import os
import re

from openai import OpenAI
from url_fetcher import extract_json_ld_recipe, fetch_page_html, html_to_text

RECIPE_STRUCTURE = {
    "type": "Dessert",
    "title": "Chocolate Cake",
    "prep_time": "5 minutes",
    "cook_time": "30 minutes",
    "servings": 4,
    "ingredients": ["2 tbsp butter", "4 pounds ham"],
    "instructions": ["Preheat oven to 350F", "Mix ingredients", "Bake for 30 minutes"],
    "additional_notes": ["You can substitute x for y"],
    "source": "",
    "language": "en",
}

EXTRACTION_INSTRUCTIONS = """
You are an expert culinary data extractor. Extract recipe details into a strict JSON format.

### Instructions:
1. If the content is invalid, non-recipe, or unreachable, return exactly: "Not a link" for URLs or "Not a valid image" for images/files.
2. Output ONLY a valid JSON object. No markdown code blocks, conversational text, or explanations.
3. For "instructions", keep all critical steps but rewrite them concise and action-oriented.
4. Extract numerical values accurately. Use "N/A" if missing.
5. For "type", use only: Dessert, Appetizer, Breakfast, Lunch, or Dinner.

### Data Structure:
{structure}
"""


def _get_client() -> OpenAI:
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise ValueError("OPENROUTER_API_KEY is not set in your .env file.")
    return OpenAI(
        base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        api_key=api_key,
        default_headers={
            "HTTP-Referer": os.getenv("OPENROUTER_REFERER", "http://localhost:5001"),
            "X-Title": os.getenv("OPENROUTER_APP_NAME", "Aurora Recipe App"),
        },
    )


def _get_model(online: bool = False) -> str:
    if online:
        return os.getenv(
            "OPENROUTER_ONLINE_MODEL",
            os.getenv("OPENROUTER_MODEL", "google/gemini-2.0-flash-001") + ":online",
        )
    return os.getenv("OPENROUTER_MODEL", "google/gemini-2.0-flash-001")


def parse_recipe_response(text: str) -> dict:
    stripped = text.strip()
    if stripped in ("Not a link", "Not a valid image"):
        raise ValueError(stripped)

    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*", "", stripped)
        stripped = re.sub(r"\s*```$", "", stripped)

    if not stripped.startswith("{"):
        start = stripped.find("{")
        end = stripped.rfind("}")
        if start != -1 and end != -1:
            stripped = stripped[start : end + 1]
        else:
            raise ValueError("Could not extract a recipe from the provided content.")

    return json.loads(stripped)


def _extract_with_messages(messages: list, online: bool = False) -> dict:
    client = _get_client()
    response = client.chat.completions.create(
        model=_get_model(online=online),
        messages=messages,
        temperature=0.2,
    )
    content = response.choices[0].message.content
    if not content:
        raise ValueError("The AI model returned an empty response.")
    return parse_recipe_response(content)


def _system_prompt() -> str:
    return EXTRACTION_INSTRUCTIONS.format(structure=RECIPE_STRUCTURE)


def _extract_recipe_from_url_online(url: str) -> dict:
    messages = [
        {"role": "system", "content": _system_prompt()},
        {
            "role": "user",
            "content": (
                f"Visit this recipe URL and extract the full recipe: {url}\n"
                "Return the structured recipe JSON only."
            ),
        },
    ]
    return _extract_with_messages(messages, online=True)


def extract_recipe_from_url(url: str) -> dict:
    try:
        html = fetch_page_html(url)
    except ValueError as exc:
        if "blocked automated access" in str(exc).lower():
            return _extract_recipe_from_url_online(url)
        raise

    structured = extract_json_ld_recipe(html)
    if structured:
        return structured

    page_text = html_to_text(html)[:50000]
    messages = [
        {"role": "system", "content": _system_prompt()},
        {
            "role": "user",
            "content": f"Extract the recipe from this webpage content (source URL: {url}):\n\n{page_text}",
        },
    ]
    return _extract_with_messages(messages)


def _file_to_data_url(filepath: str) -> str:
    mime, _ = mimetypes.guess_type(filepath)
    if not mime:
        ext = filepath.rsplit(".", 1)[-1].lower()
        mime = {
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "png": "image/png",
            "gif": "image/gif",
            "heic": "image/heic",
            "webp": "image/webp",
        }.get(ext, "application/octet-stream")

    with open(filepath, "rb") as f:
        b64 = base64.standard_b64encode(f.read()).decode()
    return f"data:{mime};base64,{b64}"


def _read_text_file(filepath: str) -> str:
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        return f.read()


def extract_recipe_from_images(filepaths: list) -> dict:
    if not filepaths:
        raise ValueError("No images provided.")

    if len(filepaths) == 1:
        prompt = "Extract the recipe from this image."
    else:
        prompt = (
            "These images show the front and back of the same recipe. "
            "Merge all information into one complete recipe."
        )

    content = [{"type": "text", "text": prompt}]
    for path in filepaths:
        content.append({
            "type": "image_url",
            "image_url": {"url": _file_to_data_url(path)},
        })

    messages = [
        {"role": "system", "content": _system_prompt()},
        {"role": "user", "content": content},
    ]
    return _extract_with_messages(messages)


def extract_recipe_from_file(filepath: str) -> dict:
    ext = filepath.rsplit(".", 1)[-1].lower() if "." in filepath else ""
    system = _system_prompt()

    if ext == "txt":
        content = _read_text_file(filepath)
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": f"Extract the recipe from this text:\n\n{content}"},
        ]
        return _extract_with_messages(messages)

    if ext == "pdf":
        try:
            from pypdf import PdfReader
        except ImportError:
            raise ValueError("PDF support requires the pypdf package.")
        reader = PdfReader(filepath)
        content = "\n".join(page.extract_text() or "" for page in reader.pages)
        if not content.strip():
            raise ValueError("Not a valid image")
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": f"Extract the recipe from this PDF text:\n\n{content[:50000]}"},
        ]
        return _extract_with_messages(messages)

    return extract_recipe_from_images([filepath])
