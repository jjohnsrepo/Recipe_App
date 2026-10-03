import sqlite3
import json
from typing import List, Dict, Optional

DATABASE_FILE = "database.db"


def _row_to_recipe(row, folder_ids=None) -> Dict:
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
        'folder_ids': folder_ids or [],
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

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL COLLATE NOCASE UNIQUE
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS recipe_folders (
            recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
            folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
            PRIMARY KEY (recipe_id, folder_id)
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS recipe_folders_folder_idx ON recipe_folders(folder_id)")

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
        return _row_to_recipe(row, _folder_ids_for_recipes([recipe_id]).get(recipe_id, []))
    except Exception as e:
        print(f"Error retrieving recipe: {e}")
        return None


def update_recipe(recipe_id: int, recipe: dict) -> bool:
    """Replace editable recipe fields. Return False when the recipe does not exist."""
    conn = sqlite3.connect(DATABASE_FILE)
    try:
        cursor = conn.execute("""
            UPDATE recipes SET
                type = ?, title = ?, prep_time = ?, cook_time = ?, servings = ?,
                ingredients = ?, instructions = ?, additional_notes = ?,
                source = ?, language = ?
            WHERE id = ?
        """, (
            recipe['type'], recipe['title'], recipe['prep_time'], recipe['cook_time'],
            recipe['servings'], json.dumps(recipe['ingredients']),
            json.dumps(recipe['instructions']), json.dumps(recipe['additional_notes']),
            recipe['source'], recipe['language'], recipe_id,
        ))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def search_recipes(
    query: Optional[str] = None,
    favorite_only: bool = False,
    recipe_type: Optional[str] = None,
    folder_id: Optional[int] = None,
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

        if folder_id is not None:
            sql += " AND EXISTS (SELECT 1 FROM recipe_folders rf WHERE rf.recipe_id = recipes.id AND rf.folder_id = ?)"
            params.append(folder_id)

        sql += " ORDER BY created_at DESC"

        cursor.execute(sql, params)
        rows = cursor.fetchall()
        conn.close()
        memberships = _folder_ids_for_recipes([row[0] for row in rows])
        return [_row_to_recipe(row, memberships.get(row[0], [])) for row in rows]

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
        conn.execute("PRAGMA foreign_keys = ON")
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


def _folder_ids_for_recipes(recipe_ids: List[int]) -> Dict[int, List[int]]:
    if not recipe_ids:
        return {}
    conn = sqlite3.connect(DATABASE_FILE)
    rows = []
    for offset in range(0, len(recipe_ids), 900):
        batch = recipe_ids[offset:offset + 900]
        placeholders = ','.join('?' for _ in batch)
        rows.extend(conn.execute(
            f"SELECT recipe_id, folder_id FROM recipe_folders WHERE recipe_id IN ({placeholders}) ORDER BY folder_id",
            batch,
        ).fetchall())
    conn.close()
    memberships = {recipe_id: [] for recipe_id in recipe_ids}
    for recipe_id, folder_id in rows:
        memberships[recipe_id].append(folder_id)
    return memberships


def list_folders() -> List[Dict]:
    conn = sqlite3.connect(DATABASE_FILE)
    rows = conn.execute("""
        SELECT folders.id, folders.name, COUNT(recipe_folders.recipe_id)
        FROM folders LEFT JOIN recipe_folders ON recipe_folders.folder_id = folders.id
        GROUP BY folders.id ORDER BY folders.name COLLATE NOCASE
    """).fetchall()
    conn.close()
    return [{'id': row[0], 'name': row[1], 'recipe_count': row[2]} for row in rows]


def get_folder_by_id(folder_id: int) -> Optional[Dict]:
    conn = sqlite3.connect(DATABASE_FILE)
    row = conn.execute("SELECT id, name FROM folders WHERE id = ?", (folder_id,)).fetchone()
    conn.close()
    return {'id': row[0], 'name': row[1]} if row else None


def create_folder(name: str) -> Dict:
    conn = sqlite3.connect(DATABASE_FILE)
    try:
        cursor = conn.execute("INSERT INTO folders (name) VALUES (?)", (name,))
        conn.commit()
        return {'id': cursor.lastrowid, 'name': name, 'recipe_count': 0}
    finally:
        conn.close()


def add_recipe_to_folder(recipe_id: int, folder_id: int) -> None:
    conn = sqlite3.connect(DATABASE_FILE)
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("INSERT OR IGNORE INTO recipe_folders (recipe_id, folder_id) VALUES (?, ?)", (recipe_id, folder_id))
        conn.commit()
    finally:
        conn.close()


def remove_recipe_from_folder(recipe_id: int, folder_id: int) -> None:
    conn = sqlite3.connect(DATABASE_FILE)
    try:
        conn.execute("DELETE FROM recipe_folders WHERE recipe_id = ? AND folder_id = ?", (recipe_id, folder_id))
        conn.commit()
    finally:
        conn.close()
