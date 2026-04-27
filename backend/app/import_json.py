
import json
import sqlite3
from pathlib import Path

def run_import():
    db_path = Path(r"c:\codex\Antigravity\mcqsolver\platform\backend\logs\app.db")
    master_json = Path(r"C:\codex\Antigravity\mcqsolver\PROJECT_WE _WANT_TO_MERGE\master-setup-export.json")
    autofill_json = Path(r"C:\codex\Antigravity\mcqsolver\PROJECT_WE _WANT_TO_MERGE\autofill_backup.json")

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    # Clear existing imported proposals to avoid duplicates/confusion if re-running
    cur.execute("DELETE FROM autofill_rule_proposals WHERE device_id = 'imported_from_json'")

    # Import Master Data
    with open(master_json, 'r') as f:
        master_data = json.load(f)

    for m in master_data.get('model_registry', []):
        cur.execute(
            """INSERT OR REPLACE INTO model_registry 
               (id, ai_model_name, version, task_type, ai_runtime, ai_model_filename, status, lifecycle_state, notes, created_at, updated_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (m.get('id'), m.get('ai_model_name'), m.get('version'), m.get('task_type'), m.get('ai_runtime'), m.get('ai_model_filename'), m.get('status'), m.get('lifecycle_state', 'production'), m.get('notes'), m.get('created_at'), m.get('updated_at'))
        )

    for fm in master_data.get('field_mappings', []):
        cur.execute(
            """INSERT OR REPLACE INTO field_mappings 
               (id, domain, field_name, task_type, source_data_type, source_selector, target_data_type, target_selector, ai_model_id, created_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (fm.get('id'), fm.get('domain'), fm.get('field_name'), fm.get('task_type'), fm.get('source_data_type'), fm.get('source_selector'), fm.get('target_data_type'), fm.get('target_selector'), fm.get('ai_model_id'), fm.get('created_at'))
        )

    # Import Autofill Data as proposals (PENDING status so they show in dashboard)
    with open(autofill_json, 'r') as f:
        autofill_data = json.load(f)
    
    rules = autofill_data.get('rules', [])
    for rule in rules:
        # Construct V26 rule structure from the backup format if needed
        # The backup format is: {"rules": [...]} where each rule has site, selector, action, value
        # V26 structure is: { site: { pattern, match_mode }, steps: [ { action, selector, value } ] }
        
        v26_rule = {
            "site": {
                "pattern": rule.get("site"),
                "match_mode": "domainPath"
            },
            "steps": [
                {
                    "action": rule.get("action"),
                    "selector": {
                        "strategy": "css" if rule.get("selector") else ("id" if rule.get("elementId") else "name"),
                        "css": rule.get("selector"),
                        "id": rule.get("elementId"),
                        "name": rule.get("name")
                    },
                    "value": rule.get("value"),
                    "order": 1
                }
            ]
        }
        
        rule_str = json.dumps(v26_rule)
        idemp = rule.get('id')
        cur.execute(
            """INSERT OR IGNORE INTO autofill_rule_proposals 
               (idempotency_key, device_id, api_key_id, status, rule_json, submitted_at, created_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (idemp, "imported_from_json", 1, "pending", rule_str, "2026-04-24T12:00:00Z", "2026-04-24T12:00:00Z")
        )

    conn.commit()
    conn.close()
    print("Import completed (rules set to pending for review).")

if __name__ == "__main__":
    run_import()
