import json
import sys
from pathlib import Path

# Add backend to sys.path
sys.path.append(str(Path("backend").resolve()))

# Mock dependencies to initialize Database
import os
os.environ["SQLITE_PATH"] = "backend/logs/app.db"

from app.core.config import get_settings
from app.core.database import Database

def restore():
    # 1. Load backup
    backup_path = Path("backend/backups/latest-master-setup.json")
    if not backup_path.exists():
        print(f"Error: {backup_path} not found")
        return
    
    with open(backup_path, "r", encoding="utf-8") as f:
        payload = json.load(f)
    
    # 2. Init DB
    settings = get_settings()
    # Force use the root-relative path for the settings object
    settings.storage.sqlite_path = str(Path("backend/logs/app.db").resolve())
    db = Database(settings)
    
    # 3. Import
    print(f"Restoring {len(payload.get('field_mappings', []))} field mappings...")
    db.import_master_setup(payload)
    print("Restore complete.")

if __name__ == "__main__":
    restore()
