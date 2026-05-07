import re

def parse_userscript_meta(code: str) -> dict:
    """
    Parses the ==UserScript== metadata block from a userscript's source code.
    Returns a dictionary containing name, version, description, matches, exclude, and runAt.
    """
    meta = {
        "name": "",
        "version": "0.0.0",
        "description": "",
        "matches": [],
        "exclude": [],
        "requires": [],
        "runAt": "document-idle",
    }
    block = re.search(r"//\s*==UserScript==([\s\S]*?)//\s*==/UserScript==", code)
    if not block:
        return meta
    
    for line in block.group(1).splitlines():
        entry = re.match(r"\s*//\s*@([\w-]+)\s+(.*)", line)
        if not entry:
            continue
        
        key = entry.group(1).strip().lower()
        val = entry.group(2).strip()
        
        if key in {"match", "include"}:
            meta["matches"].append(val)
        elif key == "exclude":
            meta["exclude"].append(val)
        elif key == "require":
            meta["requires"].append(val)
        elif key == "run-at":
            if val in {"document-start", "document-end", "document-idle"}:
                meta["runAt"] = val
        elif key == "name":
            meta["name"] = val
        elif key == "version":
            meta["version"] = val
        elif key == "description":
            meta["description"] = val
            
    return meta
