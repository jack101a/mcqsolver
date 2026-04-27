from pathlib import Path
import os

p = Path("backend/app/api/admin_routes/analytics.py").resolve()
root = p.parents[4]
admin_ui = root / "frontend" / "dist" / "index.html"

print(f"File: {p}")
print(f"Root: {root}")
print(f"Admin UI Index: {admin_ui}")
print(f"Exists? {admin_ui.exists()}")

# Also check parents[3] vs parents[4]
print(f"Parents[3]: {p.parents[3]}")
print(f"Parents[4]: {p.parents[4]}")
