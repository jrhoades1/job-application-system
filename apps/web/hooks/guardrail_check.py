#!/usr/bin/env python3
"""Stub guardrail hook — delegates to root hooks."""
import os
import subprocess
import sys
root_hook = os.path.join(os.path.dirname(__file__), "..", "..", "hooks", "guardrail_check.py")
if os.path.exists(root_hook):
    result = subprocess.run([sys.executable, root_hook], capture_output=True, text=True, input=sys.stdin.read() if not sys.stdin.isatty() else "")
    print(result.stdout, end="")
    print(result.stderr, end="", file=sys.stderr)
    sys.exit(result.returncode)
