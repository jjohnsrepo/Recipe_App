import json
import re
from html.parser import HTMLParser
from typing import Optional
from urllib.parse import urlparse

import requests

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "DNT": "1",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}


class _TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self._parts = []
        self._skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "nav", "footer", "header"):
            self._skip = True

    def handle_endtag(self, tag):
        if tag in ("script", "style", "nav", "footer", "header"):
            self._skip = False
        elif tag in ("p", "div", "br", "li", "h1", "h2", "h3", "tr"):
            self._parts.append("\n")

    def handle_data(self, data):
        if not self._skip:
            text = data.strip()
            if text:
                self._parts.append(text + " ")

    def get_text(self) -> str:
        return re.sub(r"\n{3,}", "\n\n", "".join(self._parts).strip())


def _validate_url(url: str) -> str:
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("Please provide a valid http or https URL.")
    return url.strip()


def _looks_like_blocked_page(html: str) -> bool:
    lowered = html.lower()[:2000]
    if "<title>403 - forbidden</title>" in lowered:
        return True
    if "access denied" in lowered and len(html) < 5000:
        return True
    return False


def fetch_page_markdown(url: str, max_chars: int = 50000) -> str:
    """Fetch readable page content via Jina Reader when direct access is blocked."""
    url = _validate_url(url)
    jina_url = f"https://r.jina.ai/{url}"
    resp = requests.get(
        jina_url,
        headers={"Accept": "text/markdown"},
        timeout=60,
    )
    resp.raise_for_status()
    text = resp.text.strip()
    if not text or len(text) < 100:
        raise ValueError("Could not fetch recipe content from this URL.")
    return text[:max_chars]


def fetch_page_html(url: str) -> str:
    """Fetch page HTML, trying browser-like clients before failing."""
    url = _validate_url(url)
    errors = []

    try:
        from curl_cffi import requests as curl_requests

        resp = curl_requests.get(
            url,
            impersonate="chrome120",
            timeout=30,
            allow_redirects=True,
        )
        if resp.status_code == 200 and resp.text and not _looks_like_blocked_page(resp.text):
            return resp.text
        errors.append(f"browser fetch returned {resp.status_code}")
    except ImportError:
        errors.append("curl_cffi not installed")
    except Exception as exc:
        errors.append(f"browser fetch failed: {exc}")

    session = requests.Session()
    session.headers.update(BROWSER_HEADERS)
    resp = session.get(url, timeout=30, allow_redirects=True)

    if resp.status_code == 200 and resp.text and not _looks_like_blocked_page(resp.text):
        return resp.text

    if resp.status_code in (403, 401, 429) or _looks_like_blocked_page(resp.text or ""):
        raise ValueError(
            "This website blocked automated access. "
            "Try uploading a photo of the recipe instead."
        )

    try:
        resp.raise_for_status()
    except requests.HTTPError as exc:
        raise ValueError(f"Could not fetch URL: {exc}") from exc

    if not resp.text:
        raise ValueError("Not a link")

    return resp.text


def html_to_text(html: str) -> str:
    parser = _TextExtractor()
    parser.feed(html)
    text = parser.get_text()
    if not text:
        raise ValueError("Not a link")
    return text


def _parse_iso_duration(value: str) -> str:
    if not value or not isinstance(value, str):
        return "N/A"
    if not value.startswith("PT"):
        return value

    hours = re.search(r"(\d+)H", value)
    minutes = re.search(r"(\d+)M", value)
    parts = []
    if hours:
        parts.append(f"{hours.group(1)} hour{'s' if int(hours.group(1)) != 1 else ''}")
    if minutes:
        parts.append(f"{minutes.group(1)} minute{'s' if int(minutes.group(1)) != 1 else ''}")
    return " ".join(parts) if parts else value


def _normalize_type(raw: str) -> str:
    allowed = {"Dessert", "Appetizer", "Breakfast", "Lunch", "Dinner"}
    if not raw:
        return "Dinner"
    for option in allowed:
        if option.lower() in raw.lower():
            return option
    return "Dinner"


def _normalize_list(values) -> list:
    if not values:
        return []
    if isinstance(values, str):
        return [values]
    result = []
    for item in values:
        if isinstance(item, str):
            result.append(item.strip())
        elif isinstance(item, dict):
            text = item.get("text") or item.get("name") or item.get("description")
            if text:
                result.append(str(text).strip())
    return [item for item in result if item]


def _recipe_nodes(data) -> list:
    nodes = []
    if isinstance(data, dict):
        type_value = data.get("@type")
        if isinstance(type_value, list):
            is_recipe = any(str(item).lower() == "recipe" for item in type_value)
        else:
            is_recipe = str(type_value).lower() == "recipe"
        if is_recipe:
            nodes.append(data)
        graph = data.get("@graph")
        if isinstance(graph, list):
            for item in graph:
                nodes.extend(_recipe_nodes(item))
    elif isinstance(data, list):
        for item in data:
            nodes.extend(_recipe_nodes(item))
    return nodes


def _map_schema_recipe(node: dict) -> dict:
    servings = node.get("recipeYield") or node.get("yield")
    if isinstance(servings, list):
        servings = servings[0] if servings else None
    if isinstance(servings, str):
        match = re.search(r"\d+", servings)
        servings = int(match.group()) if match else None

    return {
        "type": _normalize_type(node.get("recipeCategory") or node.get("category") or ""),
        "title": node.get("name") or "Untitled",
        "prep_time": _parse_iso_duration(node.get("prepTime") or "N/A"),
        "cook_time": _parse_iso_duration(node.get("cookTime") or "N/A"),
        "servings": servings,
        "ingredients": _normalize_list(node.get("recipeIngredient")),
        "instructions": _normalize_list(node.get("recipeInstructions")),
        "additional_notes": _normalize_list(node.get("description")),
        "source": "",
        "language": "en",
    }


def extract_json_ld_recipe(html: str) -> Optional[dict]:
    pattern = re.compile(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        re.IGNORECASE | re.DOTALL,
    )
    for match in pattern.finditer(html):
        raw = match.group(1).strip()
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue

        for node in _recipe_nodes(data):
            recipe = _map_schema_recipe(node)
            if recipe["title"] and (recipe["ingredients"] or recipe["instructions"]):
                return recipe
    return None
