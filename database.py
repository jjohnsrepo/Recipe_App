import sqlite3
import json
from typing import List, Dict, Optional

DATABASE_FILE = "database.db"

def init_db():
    """Initialize the database"""
    conn = sqlite3.connect(DATABASE_FILE)
    cursor = conn.cursor()
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS recipes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            prep_time TEXT,
            cook_time TEXT,
            servings INTEGER,
            ingredients TEXT NOT NULL,
            instructions TEXT NOT NULL,
            additional_notes TEXT,
            source TEXT,
            language TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    conn.commit()
    conn.close()


def store_recipe(recipe: dict) -> bool:
    """Save recipe to database"""
    try:
        conn = sqlite3.connect(DATABASE_FILE)
        cursor = conn.cursor()
        
        # Convert lists to JSON strings before storing
        ingredients_json = json.dumps(recipe.get('ingredients', []))
        instructions_json = json.dumps(recipe.get('instructions', []))
        notes_json = json.dumps(recipe.get('additional_notes', []))
        
        cursor.execute("""
            INSERT INTO recipes 
            (type, title, prep_time, cook_time, servings, ingredients, instructions, additional_notes, source, language)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            recipe.get('type', 'Other'),
            recipe.get('title', 'Untitled'),
            recipe.get('prep_time'),
            recipe.get('cook_time'),
            recipe.get('servings'),
            ingredients_json,
            instructions_json,
            notes_json,
            recipe.get('source'),
            recipe.get('language', 'en')
        ))
        
        conn.commit()
        conn.close()
        return True
        
    except Exception as e:
        print(f"Error storing recipe: {e}")
        return False


def get_all_recipes() -> List[Dict]:
    """Get all recipes from database"""
    try:
        conn = sqlite3.connect(DATABASE_FILE)
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM recipes")
        rows = cursor.fetchall()
        conn.close()
        
        # Convert rows back to dictionaries
        recipes = []
        for row in rows:
            recipe = {
                'id': row[0],
                'type': row[1],
                'title': row[2],
                'prep_time': row[3],
                'cook_time': row[4],
                'servings': row[5],
                'ingredients': json.loads(row[6]),  # Convert JSON string back to list
                'instructions': json.loads(row[7]),  # Convert JSON string back to list
                'additional_notes': json.loads(row[8]) if row[8] else [],
                'source': row[9],
                'language': row[10],
                'created_at': row[11]
            }
            recipes.append(recipe)
        
        return recipes
        
    except Exception as e:
        print(f"Error retrieving recipes: {e}")
        return []