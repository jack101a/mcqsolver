
import sqlite3
from pathlib import Path

def migrate():
    ref_db_path = Path(r"c:\codex\Antigravity\mcqsolver\PROJECT_WE _WANT_TO_MERGE\tata_captcha-test\backend\app_data.sqlite3")
    target_db_path = Path(r"c:\codex\Antigravity\mcqsolver\platform\backend\logs\app.db")
    
    if not ref_db_path.exists():
        print("Reference DB not found.")
        return
        
    ref_conn = sqlite3.connect(ref_db_path)
    ref_conn.row_factory = sqlite3.Row
    ref_cursor = ref_conn.cursor()
    
    target_conn = sqlite3.connect(target_db_path)
    target_cursor = target_conn.cursor()
    
    # Migrate autofill_rule_proposals
    try:
        rules = ref_cursor.execute("SELECT * FROM autofill_rule_proposals").fetchall()
        for r in rules:
            target_cursor.execute(
                """INSERT OR IGNORE INTO autofill_rule_proposals 
                   (id, idempotency_key, device_id, api_key_id, status, reviewed_by, reviewed_at, submitted_at, rule_json, approved_rule_id, created_at) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (r['id'], r['idempotency_key'], r['device_id'], r['api_key_id'], r['status'], r['reviewed_by'], r['reviewed_at'], r['submitted_at'], r['rule_json'], r['approved_rule_id'], r['created_at'])
            )
        print(f"Migrated {len(rules)} autofill rules.")
    except Exception as e:
        print(f"Skipping autofill_rule_proposals: {e}")

    # Migrate model_registry
    try:
        models = ref_cursor.execute("SELECT * FROM model_registry").fetchall()
        for m in models:
            target_cursor.execute(
                """INSERT OR IGNORE INTO model_registry 
                   (id, ai_model_name, version, task_type, ai_runtime, ai_model_filename, status, lifecycle_state, notes, created_at, updated_at) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (m['id'], m['ai_model_name'], m['version'], m['task_type'], m['ai_runtime'], m['ai_model_filename'], m['status'], m.get('lifecycle_state', 'production'), m['notes'], m['created_at'], m['updated_at'])
            )
        print(f"Migrated {len(models)} model_registry entries.")
    except Exception as e:
        print(f"Skipping model_registry: {e}")

    # Migrate api_keys
    try:
        keys = ref_cursor.execute("SELECT * FROM api_keys").fetchall()
        for k in keys:
            target_cursor.execute(
                """INSERT OR IGNORE INTO api_keys 
                   (id, name, key_hash, enabled, all_domains, created_at, expires_at, revoked_at) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (k['id'], k['name'], k['key_hash'], k['enabled'], k.get('all_domains', 1), k['created_at'], k['expires_at'], k['revoked_at'])
            )
        print(f"Migrated {len(keys)} API keys.")
    except Exception as e:
        print(f"Skipping api_keys: {e}")

    target_conn.commit()
    target_conn.close()
    ref_conn.close()
    print("Migration complete.")

if __name__ == "__main__":
    migrate()
