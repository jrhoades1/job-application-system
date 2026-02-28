#!/usr/bin/env python3
"""
Hook: Guardrail Check (PreToolUse Hook)
Purpose: Block dangerous commands before they execute.
Exit code 0 = allow, Exit code 2 = block
"""
import json, re, sys

BLOCKED_PATTERNS = [
    (re.compile(r"rm\s+-\w*r\w*f\w*\s+/"), "rm -rf /"),
    (re.compile(r"rm\s+-\w*r\w*f\w*\s+~"), "rm -rf ~"),
    (re.compile(r"rm\s+-\w*r\w*f\w*\s+\."), "rm -rf ."),
    (re.compile(r"git\s+push\s+--force\b"), "git push --force"),
    (re.compile(r"git\s+push\s+-f\b"), "git push -f"),
    (re.compile(r"git\s+reset\s+--hard\b"), "git reset --hard"),
    (re.compile(r"drop\s+table\b"), "DROP TABLE"),
    (re.compile(r"drop\s+database\b"), "DROP DATABASE"),
    (re.compile(r"delete\s+from\b"), "DELETE FROM"),
    (re.compile(r"--no-verify\b"), "--no-verify"),
]
PROTECTED_FILES = [".env", "credentials.json", "token.json", "CLAUDE.md", "memory/MEMORY.md"]

def main():
    try:
        hook_input = sys.stdin.read()
        if not hook_input: sys.exit(0)
        data = json.loads(hook_input)
        command = data.get("tool_input", {}).get("command", "")
        if not command: sys.exit(0)
        cmd_lower = command.lower().strip()
        for regex, label in BLOCKED_PATTERNS:
            if regex.search(cmd_lower):
                print(f"BLOCKED: Dangerous pattern '{label}'. Ask user for confirmation first.")
                sys.exit(2)
        for pf in PROTECTED_FILES:
            if pf in command and ("rm " in cmd_lower or "delete" in cmd_lower):
                print(f"BLOCKED: Cannot delete protected file '{pf}'.")
                sys.exit(2)
        sys.exit(0)
    except Exception:
        sys.exit(0)

if __name__ == "__main__":
    main()
