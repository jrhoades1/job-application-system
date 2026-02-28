#!/usr/bin/env python3
"""Hook: Memory Auto-Capture (Stop Hook). Ensures daily log exists."""
import json, sys
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
LOGS_DIR = PROJECT_ROOT / "memory" / "logs"

def main():
    try:
        today = datetime.now()
        log_path = LOGS_DIR / f"{today.strftime('%Y-%m-%d')}.md"
        if not log_path.exists():
            LOGS_DIR.mkdir(parents=True, exist_ok=True)
            log_path.write_text(
                f"# Daily Log: {today.strftime('%Y-%m-%d')}\n\n"
                f"> Session log for {today.strftime('%A, %B %d, %Y')}\n\n---\n\n## Events & Notes\n\n"
            )
        hook_input = sys.stdin.read() if not sys.stdin.isatty() else ""
        if hook_input:
            try:
                json.loads(hook_input)
                with open(log_path, "a") as f:
                    f.write(f"- [{today.strftime('%H:%M')}] Session activity captured\n")
            except json.JSONDecodeError:
                pass
    except Exception:
        pass

if __name__ == "__main__":
    main()
