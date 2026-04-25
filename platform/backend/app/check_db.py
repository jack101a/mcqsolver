import sqlite3
path = r"c:\codex\Antigravity\mcqsolver\PROJECT_WE _WANT_TO_MERGE\tata_captcha-test\backend\app_data.sqlite3"
try:
    conn = sqlite3.connect(path)
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    print(cur.fetchall())
except Exception as e:
    print("Error:", e)
