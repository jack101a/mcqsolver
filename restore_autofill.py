import json
import sys
import hashlib
from pathlib import Path
from datetime import datetime, timezone

# Add backend to sys.path
sys.path.append(str(Path("backend").resolve()))

# Mock dependencies to initialize Database
import os
os.environ["SQLITE_PATH"] = "backend/logs/app.db"

from app.core.config import get_settings
from app.core.database import Database

def restore():
    # 1. Load backup
    backup_path = Path("backend/backups/autofill_backup.json")
    if not backup_path.exists():
        print(f"Error: {backup_path} not found")
        return
    
    with open(backup_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    rules = data.get("rules", [])
    if not rules:
        print("No rules found in backup")
        return

    # 2. Init DB
    settings = get_settings()
    settings.storage.sqlite_path = str(Path("backend/logs/app.db").resolve())
    db = Database(settings)
    
    # 3. Convert and Import
    print(f"Converting and restoring {len(rules)} autofill rules...")
    
    with db.connect() as conn:
        now = datetime.now(timezone.utc).isoformat()
        count = 0
        for old_rule in rules:
            # Map old rule to V26 schema
            site_pattern = old_rule.get("site", "")
            action = old_rule.get("action", "text")
            value = old_rule.get("value", "")
            if value == "N/A": value = ""
            
            selector = {
                "strategy": "css",
                "css": old_rule.get("selector", "")
            }
            
            new_rule = {
                "local_rule_id": f"restored_{old_rule.get('id')}",
                "name": f"Restored: {site_pattern}",
                "site": {
                    "match_mode": "domainPath",
                    "pattern": site_pattern
                },
                "steps": [{
                    "order": 1,
                    "action": action,
                    "value": value,
                    "selector": selector
                }],
                "meta": {
                    "restored_at": now,
                    "original_id": old_rule.get("id")
                }
            }
            
            rule_json = json.dumps(new_rule)
            idempotency_key = hashlib.sha1(rule_json.encode()).hexdigest()
            server_rule_id = "srv_" + idempotency_key[:12]
            
            conn.execute(
                """
                INSERT OR IGNORE INTO autofill_rule_proposals
                    (idempotency_key, device_id, api_key_id, status,
                     submitted_at, rule_json, created_at, reviewed_by, reviewed_at, approved_rule_id)
                VALUES (?, ?, ?, 'approved', ?, ?, ?, 'admin', ?, ?)
                """,
                (idempotency_key, "migration", 1, now, rule_json, now, now, server_rule_id)
            )
            count += 1
        
        conn.commit()
    
    print(f"Done. {count} rules imported as 'approved'.")

if __name__ == "__main__":
    restore()
