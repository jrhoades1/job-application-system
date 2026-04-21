"""
Backfill archetypes for existing applications.

Runs in two modes:
  --mode metadata      (default) — re-classify applications/*/metadata.json
                         in place. Writes archetype + archetype_confidence.
  --mode supabase      — emit a JSON payload of {id, archetype, confidence}
                         rows for `applications` and `pipeline_leads`. Apply
                         via psql or the Supabase SQL editor with UPDATE ...
                         FROM (values) AS u(id, archetype, confidence).
  --mode both          — run metadata then print supabase payload.

Usage:
    python scripts/backfill_archetypes.py --mode metadata --dry-run
    python scripts/backfill_archetypes.py --mode metadata
    python scripts/backfill_archetypes.py --mode supabase --input leads.json

The supabase mode reads a JSON file of rows (exported from Supabase via
`select id, role, job_description from applications;`) and writes the
update payload to stdout. No network calls are made — this keeps the
script offline-safe.
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
APPLICATIONS_DIR = REPO_ROOT / "applications"

sys.path.insert(0, str(REPO_ROOT / "packages" / "scoring-rules"))
import classify_archetype as ca  # type: ignore  # noqa: E402 — runtime sys.path mutation


@dataclass
class BackfillStats:
    scanned: int = 0
    updated: int = 0
    skipped_no_role: int = 0
    skipped_already_classified: int = 0
    errors: int = 0


def backfill_metadata(dry_run: bool = False, force: bool = False) -> BackfillStats:
    stats = BackfillStats()
    if not APPLICATIONS_DIR.exists():
        return stats

    config = ca.load_config()

    for folder in sorted(APPLICATIONS_DIR.iterdir()):
        if not folder.is_dir():
            continue
        md_path = folder / "metadata.json"
        if not md_path.exists():
            continue
        stats.scanned += 1

        try:
            meta = json.loads(md_path.read_text(encoding="utf-8", errors="replace"))
        except json.JSONDecodeError:
            stats.errors += 1
            continue

        if not force and meta.get("archetype"):
            stats.skipped_already_classified += 1
            continue

        role = meta.get("role") or meta.get("title") or ""
        if not role:
            stats.skipped_no_role += 1
            continue

        jd_file = folder / "job-description.md"
        jd = jd_file.read_text(encoding="utf-8", errors="replace") if jd_file.exists() else ""
        result = ca.classify_archetype(role, jd, config=config)

        meta["archetype"] = result.archetype
        meta["archetype_confidence"] = round(result.confidence, 3)

        if not dry_run:
            md_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
        stats.updated += 1

    return stats


def backfill_supabase(input_path: Path) -> list[dict]:
    """Read a JSON file of {id, role, job_description} rows and return
    {id, archetype, archetype_confidence} payloads. Caller pipes into SQL."""
    data = json.loads(input_path.read_text(encoding="utf-8"))
    config = ca.load_config()
    out: list[dict] = []
    for row in data:
        role = row.get("role") or ""
        jd = row.get("job_description") or row.get("description_text") or ""
        if not role:
            continue
        result = ca.classify_archetype(role, jd, config=config)
        out.append({
            "id": row.get("id"),
            "archetype": result.archetype,
            "archetype_confidence": round(result.confidence, 3),
        })
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["metadata", "supabase", "both"], default="metadata")
    parser.add_argument("--dry-run", action="store_true", help="no writes; preview counts only")
    parser.add_argument("--force", action="store_true", help="reclassify even if archetype already set")
    parser.add_argument("--input", type=Path, help="Supabase rows JSON file (for --mode supabase)")
    args = parser.parse_args(argv)

    if args.mode in ("metadata", "both"):
        stats = backfill_metadata(dry_run=args.dry_run, force=args.force)
        print("=== metadata backfill ===", file=sys.stderr)
        print(f"  scanned:                      {stats.scanned}", file=sys.stderr)
        print(f"  updated:                      {stats.updated}", file=sys.stderr)
        print(f"  skipped (no role):            {stats.skipped_no_role}", file=sys.stderr)
        print(f"  skipped (already classified): {stats.skipped_already_classified}", file=sys.stderr)
        print(f"  errors:                       {stats.errors}", file=sys.stderr)

    if args.mode in ("supabase", "both"):
        if not args.input:
            print("error: --mode supabase requires --input", file=sys.stderr)
            return 2
        rows = backfill_supabase(args.input)
        print(json.dumps(rows, indent=2))

    return 0


if __name__ == "__main__":
    sys.exit(main())
