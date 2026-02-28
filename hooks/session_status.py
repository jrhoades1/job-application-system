#!/usr/bin/env python3
"""Hook: Session Status. Outputs JSON project state summary."""
import json
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
MEMORY_MD = PROJECT_ROOT / "memory" / "MEMORY.md"
LOGS_DIR = PROJECT_ROOT / "memory" / "logs"

def main():
    hour = datetime.now().hour
    tod = "morning" if hour < 12 else "afternoon" if hour < 17 else "evening"
    print(json.dumps({
        "timestamp": datetime.now().isoformat(),
        "time_of_day": tod,
        "project": {"name": PROJECT_ROOT.name, "type": "internal"},
        "memory_exists": MEMORY_MD.exists(),
    }, indent=2))

if __name__ == "__main__":
    main()
