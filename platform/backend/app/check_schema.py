import sqlite3
conn = sqlite3.connect(r"c:\codex\Antigravity\mcqsolver\platform\backend\logs\app.db")
print(conn.execute("SELECT sql FROM sqlite_master WHERE name='autofill_rule_proposals'").fetchone()[0])
