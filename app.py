from flask import Flask, request, jsonify, render_template
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
import os
import json
import uuid
from database import (
    init_db,
    store_recipe,
    get_recipe_by_id,
    search_recipes,
    toggle_favorite,
    delete_recipe,
)
from ai_extractor import extract_recipe_from_url, extract_recipe_from_file, extract_recipe_from_images
from image_utils import is_image_file, prepare_image

app = Flask(__name__)

load_dotenv()

UPLOAD_FOLDER = "./uploads"
ALLOWED_EXTENSIONS = {"txt", "pdf", "png", "jpg", "jpeg", "gif", "heic", "heif", "webp"}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_PHOTOS = 2

init_db()


def save_and_respond(recipe: dict):
    """Store recipe and return JSON with id."""
    recipe_id = store_recipe(recipe)
    if recipe_id is None:
        return jsonify({"error": "Failed to save recipe to database."}), 500
    recipe["id"] = recipe_id
    recipe["is_favorite"] = False
    return jsonify(recipe), 200


@app.route("/")
def landing():
    return render_template("landing.html")


@app.route("/main")
def main():
    return render_template("index.html")


@app.route("/recipe_link", methods=["POST"])
def extract_url():
    data = request.get_json()
    if not data or "url" not in data:
        return jsonify({"error": "Please provide a 'url' in the JSON body."}), 400
    try:
        recipe = extract_recipe_from_url(data["url"])
        recipe["source"] = data["url"]
        return save_and_respond(recipe)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except json.JSONDecodeError:
        return jsonify({"error": "Failed to parse the AI response as JSON."}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def allowed_file(filename, allowed_extensions):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in allowed_extensions


@app.route("/recipe_image", methods=["POST"])
def extract_image():
    uploads = [f for f in request.files.getlist("photos") if f.filename]
    if not uploads and request.files.get("photo") and request.files["photo"].filename:
        uploads = [request.files["photo"]]

    if not uploads:
        return jsonify({"error": "No file selected."}), 400

    if len(uploads) > MAX_PHOTOS:
        return jsonify({"error": f"Please upload at most {MAX_PHOTOS} photos."}), 400

    for f in uploads:
        if not allowed_file(f.filename, ALLOWED_EXTENSIONS):
            return jsonify({"error": "Invalid file type. Use an image, PDF, or text file."}), 400
        f.seek(0, os.SEEK_END)
        if f.tell() > MAX_UPLOAD_BYTES:
            return jsonify({"error": "Each file must be 10 MB or smaller."}), 400
        f.seek(0)

    if len(uploads) > 1 and not all(is_image_file(f.filename) for f in uploads):
        return jsonify({"error": "Multiple uploads are only supported for images."}), 400

    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    saved_paths = []
    api_paths = []
    cleanup_paths = []

    try:
        for f in uploads:
            original_name = secure_filename(f.filename) or "upload"
            filename = f"{uuid.uuid4().hex}_{original_name}"
            filepath = os.path.join(UPLOAD_FOLDER, filename)
            f.save(filepath)
            saved_paths.append(filepath)

            if is_image_file(filepath):
                api_path, prepared_path = prepare_image(filepath)
                api_paths.append(api_path)
                if prepared_path:
                    cleanup_paths.append(prepared_path)
            else:
                recipe = extract_recipe_from_file(filepath)
                return save_and_respond(recipe)

        recipe = extract_recipe_from_images(api_paths)
        return save_and_respond(recipe)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except json.JSONDecodeError:
        return jsonify({"error": "Failed to parse the AI response as JSON."}), 500
    except Exception as e:
        msg = str(e)
        if any(word in msg.lower() for word in ("image", "vision", "multimodal")):
            return jsonify({
                "error": "Image upload failed. Try a vision-capable model in OPENROUTER_MODEL."
            }), 400
        return jsonify({"error": msg}), 500
    finally:
        for path in set(saved_paths + cleanup_paths):
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except OSError:
                    pass


@app.route("/all-recipes")
def all_recipes():
    return render_template("all-recipes.html")


@app.route("/api/recipes", methods=["GET"])
def api_get_recipes():
    query = request.args.get("q", "").strip() or None
    favorite_only = request.args.get("favorite") == "1"
    recipe_type = request.args.get("type", "").strip() or None
    recipes = search_recipes(query=query, favorite_only=favorite_only, recipe_type=recipe_type)
    return jsonify(recipes), 200


@app.route("/api/recipes/<int:recipe_id>", methods=["GET"])
def api_get_recipe(recipe_id):
    recipe = get_recipe_by_id(recipe_id)
    if not recipe:
        return jsonify({"error": "Recipe not found"}), 404
    return jsonify(recipe), 200


@app.route("/api/recipes/<int:recipe_id>/favorite", methods=["PATCH"])
def api_toggle_favorite(recipe_id):
    new_state = toggle_favorite(recipe_id)
    if new_state is None:
        return jsonify({"error": "Recipe not found"}), 404
    return jsonify({"id": recipe_id, "is_favorite": new_state}), 200


@app.route("/api/recipes/<int:recipe_id>", methods=["DELETE"])
def api_delete_recipe(recipe_id):
    if not delete_recipe(recipe_id):
        return jsonify({"error": "Recipe not found"}), 404
    return jsonify({"id": recipe_id, "deleted": True}), 200


@app.route("/test")
def test():
    return "Test good"


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    print(f"Open http://127.0.0.1:{port} in your browser")
    app.run(debug=True, port=port)
