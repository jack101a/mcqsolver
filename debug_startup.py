import sys
import os
from pathlib import Path

# Set PYTHONPATH to include backend directory
backend_dir = Path("backend").resolve()
sys.path.append(str(backend_dir))

print(f"PYTHONPATH: {sys.path}")

try:
    from app.main import app
    print("Successfully imported app.main:app")
    
    # Check if we can get settings
    from app.core.config import get_settings
    settings = get_settings()
    print("Successfully loaded settings")
    print(f"Server Host: {settings.server.host}")
    print(f"Server Port: {settings.server.port}")
    
except Exception as e:
    print(f"Error during import: {e}")
    import traceback
    traceback.print_exc()
