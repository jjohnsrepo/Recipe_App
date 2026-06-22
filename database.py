import sqlite3
import json
from typing import List, Dict, Optional

DATABASE_FILE = "database.db"


def _row_to_recipe(row) -> Dict:
    return {
        'id': row[0],
        'type': row[1],
        'title': row[2],
        'prep_time': row[3],
        'cook_time': row[4],
        'servings': row[5],
        'ingredients': json.loads(row[6]),
        'instructions': json.loads(row[7]),
        'additional_notes': json.loads(row[8]) if row[8] else [],
        'source': row[9],
        'language': row[10],
        'created_at': row[11],
        'is_favorite': bool(row[12]) if len(row) > 12 else False,
    }


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

    try:
        cursor.execute("ALTER TABLE recipes ADD COLUMN is_favorite INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass

    conn.commit()
    conn.close()


def store_recipe(recipe: dict) -> Optional[int]:
    """Save recipe to database. Returns inserted id or None on failure."""
    try:
        conn = sqlite3.connect(DATABASE_FILE)
        cursor = conn.cursor()

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

        recipe_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return recipe_id

    except Exception as e:
        print(f"Error storing recipe: {e}")
        return None


def get_recipe_by_id(recipe_id: int) -> Optional[Dict]:
    """Get a single recipe by id."""
    try:
        conn = sqlite3.connect(DATABASE_FILE)
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM recipes WHERE id = ?", (recipe_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            return None
        return _row_to_recipe(row)
    except Exception as e:
        print(f"Error retrieving recipe: {e}")
        return None


def search_recipes(
    query: Optional[str] = None,
    favorite_only: bool = False,
    recipe_type: Optional[str] = None,
) -> List[Dict]:
    """Search recipes with optional filters."""
    try:
        conn = sqlite3.connect(DATABASE_FILE)
        cursor = conn.cursor()

        sql = "SELECT * FROM recipes WHERE 1=1"
        params = []

        if query:
            sql += " AND (title LIKE ? OR ingredients LIKE ?)"
            pattern = f"%{query}%"
            params.extend([pattern, pattern])

        if favorite_only:
            sql += " AND is_favorite = 1"

        if recipe_type:
            sql += " AND type = ?"
            params.append(recipe_type)

        sql += " ORDER BY created_at DESC"

        cursor.execute(sql, params)
        rows = cursor.fetchall()
        conn.close()
        return [_row_to_recipe(row) for row in rows]

    except Exception as e:
        print(f"Error searching recipes: {e}")
        return []


def toggle_favorite(recipe_id: int) -> Optional[bool]:
    """Toggle favorite status. Returns new is_favorite state or None if not found."""
    try:
        conn = sqlite3.connect(DATABASE_FILE)
        cursor = conn.cursor()

        cursor.execute("SELECT is_favorite FROM recipes WHERE id = ?", (recipe_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return None

        new_state = 0 if row[0] else 1
        cursor.execute(
            "UPDATE recipes SET is_favorite = ? WHERE id = ?",
            (new_state, recipe_id),
        )
        conn.commit()
        conn.close()
        return bool(new_state)

    except Exception as e:
        print(f"Error toggling favorite: {e}")
        return None


def delete_recipe(recipe_id: int) -> bool:
    """Delete a recipe by id. Returns True if deleted, False if not found."""
    try:
        conn = sqlite3.connect(DATABASE_FILE)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM recipes WHERE id = ?", (recipe_id,))
        deleted = cursor.rowcount > 0
        conn.commit()
        conn.close()
        return deleted
    except Exception as e:
        print(f"Error deleting recipe: {e}")
        return False


def get_all_recipes() -> List[Dict]:
    """Get all recipes from database"""
    return search_recipes()
