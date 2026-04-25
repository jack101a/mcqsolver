
import sqlite3
import json

def dump_db(path):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    tables = [row[0] for row in cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")]
    data = {}
    for table in tables:
        rows = cursor.execute(f"SELECT * FROM {table}").fetchall()
        data[table] = [dict(row) for row in rows]
    conn.close()
    return data

ref_db = r"c:\codex\Antigravity\mcqsolver\PROJECT_WE _WANT_TO_MERGE\tata_captcha-test\backend\app_data.sqlite3"
try:
    data = dump_db(ref_db)
    for table, rows in data.items():
        print(f"Table: {table}, Count: {len(rows)}")
        if len(rows) > 0:
            print(f"  First row: {rows[0]}")
except Exception as e:
    print(f"Error: {e}")
