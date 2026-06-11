from flask import Flask, request, jsonify, render_template
from werkzeug.utils import secure_filename
from google import genai
from google.genai.types import Tool, GenerateContentConfig
from dotenv import load_dotenv
import os, json
from database import init_db, store_recipe, get_all_recipes

app = Flask(__name__)

load_dotenv()
API_KEY=os.getenv("API_KEY")
model_id="gemini-3.1-flash-lite"
client = genai.Client(api_key=API_KEY)

recipe_structure = {
    "type": "Dessert",  #ONLY use Dessert, Appetizer, Breakfast, Lunch, or Dinner
    "title": "Chocolate Cake",
    "prep_time": "5 minutes",
    "cook_time": "30 minutes",
    "servings": 4,

    "ingredients": [
        #A list of strings that list each ingredient needed for the recipe
        "2 tbsp butter",
        "4 pounds ham"
    ],

    "instructions": [
        #A list of strings. A summmary of each instruction needed, line by line
        "Preheat oven to 350F",
        "Mix ingredients",
        "Bake for 30 minutes"
    ],

    "additional_notes": [
        #A list of strings that list any additional or helpful notes needed but not included in the instructions
        "You can substitute x for y",
    ],

    "source": "", 
    "language": "en"
}

def recipe_url(url):
    tools = [
    {"url_context": {}},
    ]

    response = client.models.generate_content(
        model=model_id,
        contents=f"""You are an expert culinary data extractor. Your task is to analyze the provided URL and extract recipe details into a strict JSON format.

                    ### Instructions:
                    1. If the provided URL is invalid, non-recipe content, or unreachable, return exactly: "Not a link"
                    2. Output ONLY a valid JSON object. Do not include markdown code blocks (e.g., ```json), conversational text, or explanations.
                    3. For the "instructions" field, maintain all critical steps but rewrite them to be concise, action-oriented, and easy to read.
                    4. Ensure all numerical values (times, quantities) are extracted accurately. If a value is missing, return "N/A".

                    ### Data Structure:
                    {recipe_structure}

                    ### URL to process:
                    {url}
            """,
        config=GenerateContentConfig(tools=tools)
    )

    recipe_data = json.loads(response.text)

    return recipe_data



@app.route("/")
def landing():
    return render_template("landing.html")


@app.route("/main")
def main():
    return render_template("index.html")

@app.route('/recipe_link', methods=['POST'])
def extract_url():
    # Expects a JSON payload like: {"url": "https://example.com/recipe"}
    data = request.get_json()
    if not data or 'url' not in data:
        return jsonify({"error": "Please provide a 'url' in the JSON body."}), 400
    try:
        recipe = recipe_url(data['url'])
        print(f"Response is this: {recipe}")
        store_recipes(recipe) 
        return jsonify(recipe), 200
    except json.JSONDecodeError:
        return jsonify({"error": "Failed to parse the response from Gemini as JSON."}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def allowed_file(filename, allowed_extensions):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in allowed_extensions


@app.route('/recipe_image', methods=['POST'])
def extract_image():
    UPLOAD_FOLDER = "./uploads"
    ALLOWED_EXTENSIONS = {'txt', 'pdf', 'png', 'jpg', 'jpeg', 'gif','heic'}

    # 1. Check if the file is actually in the request
    if 'photo' not in request.files:
        return "No file part", 400
        
    f = request.files['photo']
    
    # 2. If the user submits an empty form without selecting a file
    if f.filename == '':
        return "No selected file", 400
        
    # 3. Validate and save the file
    if f and allowed_file(f.filename, ALLOWED_EXTENSIONS):
        filename = secure_filename(f.filename)
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        f.save(filepath)
        
        # TODO: Pass `filepath` to your Gemini code here
        recipe_file = client.files.upload(file=filepath)
        response = client.models.generate_content(
        model="gemini-3.1-flash-lite",
        contents=[recipe_file,
        f"""You are an expert culinary data extractor. Your task is to analyze the provided file and extract recipe details into a strict JSON format.

                    ### Instructions:
                    1. If the provided image is invalid, non-recipe content, or unreachable, return exactly: "Not a valid image"
                    2. Output ONLY a valid JSON object. Do not include markdown code blocks (e.g., ```json), conversational text, or explanations.
                    3. For the "instructions" field, maintain all critical steps but rewrite them to be concise, action-oriented, and easy to read.
                    4. Ensure all numerical values (times, quantities) are extracted accurately. If a value is missing, return "N/A".

                    ### Data Structure:
                    {recipe_structure}
            """]
        )
        print(response.text)
        recipe = json.loads(response.text)
        store_recipes(recipe)
        
        return jsonify(recipe), 200
    
    return "Invalid file type", 400

@app.route('/all-recipes')
def all_recipes():
    return render_template("all-recipes.html")

@app.route('/api/recipes', methods=["GET"])
def api_get_recipes():
    recipes = get_all_recipes()
    return jsonify(recipes), 200

def store_recipes(recipe: dict) -> bool:
    return store_recipe(recipe)

@app.route('/test')
def test():
    return "Test good"

if __name__ == "__main__":
    init_db() 
    app.run(debug=True, port=5000)