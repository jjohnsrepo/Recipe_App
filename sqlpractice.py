import sqlite3

conn = sqlite3.connect("database.db")

cursor = conn.cursor()


cursor.execute("select * from recipes")
rows = cursor.fetchall()
for row in rows:
    print(row)