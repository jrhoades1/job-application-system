#!/usr/bin/env python3
"""Hook: Output Validation (PostToolUse). Exit 0 = pass."""
import json, sys

def main():
    try:
        hook_input = sys.stdin.read()
        if not hook_input: sys.exit(0)
        data = json.loads(hook_input)
        output = data.get("tool_output", "").strip()
        if output and (output.startswith("{") or output.startswith("[")):
            parsed = json.loads(output)
            if isinstance(parsed, dict) and parsed.get("success") is False:
                print(f"Output validation warning: {parsed.get('error', 'Unknown error')}")
        sys.exit(0)
    except Exception:
        sys.exit(0)

if __name__ == "__main__":
    main()
