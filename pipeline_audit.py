#!/usr/bin/env python3
"""
Pipeline Audit Script — Read-only audit of the email pipeline.
Connects to Gmail IMAP, compares against local pipeline data, reports gaps.
"""

import imaplib
import email
import json
import os
from pathlib import Path
from collections import defaultdict

BASE = Path("c:/Users/Tracy/Projects/job-applications")
PIPELINE = BASE / "pipeline"
RAW_DIR = PIPELINE / "staging" / "raw"
PARSED_DIR = PIPELINE / "staging" / "parsed"
SOURCED_DIR = PIPELINE / "staging" / "sourced"
FINGERPRINTS = PIPELINE / "fingerprints.json"
REVIEW_QUEUE = PIPELINE / "review_queue.json"
APPLICATIONS = BASE / "applications"
CONFIG = BASE / "pipeline_config.json"

def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def section(title):
    print(f"\n{'='*70}")
    print(f"  {title}")
    print(f"{'='*70}")

def subsection(title):
    print(f"\n--- {title} ---")

# ─────────────────────────────────────────────────────
# 1. Connect to Gmail and get all inbox emails
# ─────────────────────────────────────────────────────
section("1. GMAIL INBOX AUDIT")

config = load_json(CONFIG)
gmail_addr = config["email"]["address"]
imap_host = config["email"]["imap_host"]
imap_port = config["email"]["imap_port"]
app_pw_env = config["email"]["app_password_env"]
app_password = os.environ.get(app_pw_env)

if not app_password:
    print(f"ERROR: Environment variable {app_pw_env} not set. Cannot connect to Gmail.")
    print("Skipping Gmail portion of audit. Local-only audit follows.\n")
    gmail_emails = None
else:
    try:
        print(f"Connecting to {imap_host}:{imap_port} as {gmail_addr}...")
        mail = imaplib.IMAP4_SSL(imap_host, imap_port)
        mail.login(gmail_addr, app_password)

        # Check INBOX
        status, data = mail.select("INBOX", readonly=True)
        inbox_count = int(data[0])
        print(f"INBOX message count: {inbox_count}")

        # Fetch all UIDs, subjects, dates, message-ids
        status, data = mail.uid("SEARCH", None, "ALL")
        if status != "OK":
            print("ERROR: Could not search inbox")
            gmail_emails = None
        else:
            uids = data[0].split()
            print(f"Total UIDs found: {len(uids)}")

            gmail_emails = {}
            for uid_bytes in uids:
                uid_str = uid_bytes.decode()
                # Fetch envelope data
                status, msg_data = mail.uid("FETCH", uid_bytes, "(BODY.PEEK[HEADER.FIELDS (SUBJECT DATE MESSAGE-ID FROM)])")
                if status == "OK" and msg_data[0] is not None:
                    header_data = msg_data[0][1]
                    msg = email.message_from_bytes(header_data)
                    subject = str(email.header.decode_header(msg.get("Subject", ""))[0][0] or "")
                    if isinstance(subject, bytes):
                        subject = subject.decode("utf-8", errors="replace")
                    gmail_emails[uid_str] = {
                        "uid": uid_str,
                        "subject": subject[:120],
                        "date": msg.get("Date", ""),
                        "message_id": msg.get("Message-ID", ""),
                        "from": msg.get("From", ""),
                    }

            print(f"Successfully fetched headers for {len(gmail_emails)} emails")

        # Also check processed label
        processed_label = config["email"]["labels"].get("processed", "pipeline/processed")
        status, data = mail.select(processed_label, readonly=True)
        if status == "OK":
            processed_count = int(data[0])
            print(f"'{processed_label}' label: {processed_count} messages")

            status, data = mail.uid("SEARCH", None, "ALL")
            processed_uids = set()
            if status == "OK" and data[0]:
                processed_uids = set(u.decode() for u in data[0].split())
            print(f"  UIDs in processed: {len(processed_uids)}")
        else:
            print(f"Could not select '{processed_label}' label (may not exist)")
            processed_uids = set()

        # Check other labels
        for label_name, label_path in config["email"]["labels"].items():
            if label_name == "processed":
                continue
            status, data = mail.select(label_path, readonly=True)
            if status == "OK":
                count = int(data[0])
                print(f"'{label_path}' label: {count} messages")

        mail.logout()
    except Exception as e:
        print(f"Gmail connection error: {e}")
        gmail_emails = None

# ─────────────────────────────────────────────────────
# 2. Local Pipeline Analysis
# ─────────────────────────────────────────────────────
section("2. LOCAL PIPELINE ANALYSIS")

# Load fingerprints
fingerprints = load_json(FINGERPRINTS)
print(f"Fingerprints: {len(fingerprints)} message_id -> UID mappings")
fp_uids = set(fingerprints.values())
print(f"  Unique UIDs in fingerprints: {sorted(fp_uids, key=int)}")

# Raw emails
raw_files = sorted([f.stem for f in RAW_DIR.glob("*.json")], key=int)
print(f"\nRaw fetched emails: {len(raw_files)} files")
print(f"  UIDs: {raw_files}")

# Parsed emails
parsed_files = sorted([f.stem for f in PARSED_DIR.glob("*.json")], key=int)
print(f"\nParsed emails: {len(parsed_files)} files")
print(f"  UIDs: {parsed_files}")

# Sourced leads
sourced_files = sorted(SOURCED_DIR.glob("*.json"))
sourced_by_uid = defaultdict(list)
for f in sourced_files:
    parts = f.stem.split("_")
    uid = parts[0]
    sourced_by_uid[uid].append(f.name)
print(f"\nSourced leads: {len(sourced_files)} files from {len(sourced_by_uid)} emails")

# ─────────────────────────────────────────────────────
# 3. Gap Analysis: Fetching
# ─────────────────────────────────────────────────────
section("3. GAP ANALYSIS: FETCH COVERAGE")

raw_uid_set = set(raw_files)
parsed_uid_set = set(parsed_files)

if gmail_emails:
    gmail_uid_set = set(gmail_emails.keys())

    # Emails in Gmail INBOX but not fetched
    inbox_not_fetched = gmail_uid_set - raw_uid_set
    if inbox_not_fetched:
        print(f"\n*** INBOX emails NOT fetched to pipeline: {len(inbox_not_fetched)} ***")
        for uid in sorted(inbox_not_fetched, key=lambda x: int(x) if x.isdigit() else 0):
            info = gmail_emails[uid]
            print(f"  UID {uid}: {info['subject'][:80]}")
            print(f"           Date: {info['date']}")
            print(f"           From: {info['from'][:60]}")
    else:
        print("\nAll INBOX emails have been fetched. No gaps.")

    # Fetched emails not in Gmail INBOX (moved/deleted)
    fetched_not_in_inbox = raw_uid_set - gmail_uid_set
    if fetched_not_in_inbox:
        print(f"\nFetched emails no longer in INBOX: {len(fetched_not_in_inbox)}")
        for uid in sorted(fetched_not_in_inbox, key=int):
            raw = load_json(RAW_DIR / f"{uid}.json")
            print(f"  UID {uid}: {raw.get('subject', '?')[:80]}")

    # Check if moved to processed
    if processed_uids:
        moved_to_processed = raw_uid_set & processed_uids
        still_in_inbox = raw_uid_set & gmail_uid_set
        print(f"\nFetched emails in 'processed' label: {len(moved_to_processed)}")
        print(f"Fetched emails still in INBOX: {len(still_in_inbox)}")
else:
    print("(Gmail connection unavailable — checking local consistency only)")

    # Check if UIDs are sequential
    if raw_files:
        max_uid = max(int(u) for u in raw_files)
        expected = set(str(i) for i in range(1, max_uid + 1))
        missing_uids = expected - raw_uid_set
        if missing_uids:
            print(f"\nGap in UID sequence (1-{max_uid}): missing UIDs {sorted(missing_uids, key=int)}")
        else:
            print(f"\nUIDs are sequential from 1 to {max_uid}. No local gaps.")

# ─────────────────────────────────────────────────────
# 4. Gap Analysis: Parsing
# ─────────────────────────────────────────────────────
section("4. GAP ANALYSIS: PARSE COVERAGE")

fetched_not_parsed = raw_uid_set - parsed_uid_set
parsed_not_fetched = parsed_uid_set - raw_uid_set

if fetched_not_parsed:
    print(f"\n*** Fetched but NOT parsed: {len(fetched_not_parsed)} emails ***")
    for uid in sorted(fetched_not_parsed, key=int):
        raw = load_json(RAW_DIR / f"{uid}.json")
        print(f"  UID {uid}: {raw.get('subject', '?')[:80]}")
else:
    print("\nAll fetched emails have been parsed. No gaps.")

if parsed_not_fetched:
    print(f"\nParsed but no raw file: {len(parsed_not_fetched)} (anomaly)")

# ─────────────────────────────────────────────────────
# 5. Gap Analysis: Lead Extraction (parsed -> sourced)
# ─────────────────────────────────────────────────────
section("5. GAP ANALYSIS: LEAD EXTRACTION")

# Analyze each parsed file
parsed_lead_count = 0
parsed_unresolved_count = 0
uids_with_leads = set()
uids_unresolved = set()
uids_no_leads = set()

for uid in parsed_files:
    parsed = load_json(PARSED_DIR / f"{uid}.json")
    leads = []
    if isinstance(parsed, list):
        leads = parsed
    elif isinstance(parsed, dict) and "leads" in parsed:
        leads = parsed["leads"]
    elif isinstance(parsed, dict):
        leads = [parsed]

    job_leads = [item for item in leads if item.get("type") == "job_lead"]
    unresolved = [item for item in leads if item.get("type") == "unresolved"]

    if job_leads:
        parsed_lead_count += len(job_leads)
        uids_with_leads.add(uid)
    if unresolved:
        parsed_unresolved_count += len(unresolved)
        uids_unresolved.add(uid)
    if not job_leads and not unresolved:
        # Check if it's a not-job-related or notification
        not_job = [item for item in leads if item.get("type") in ("not_job_related", "notification_only")]
        if not_job:
            pass  # expected
        else:
            uids_no_leads.add(uid)

print(f"Parsed emails with job leads: {len(uids_with_leads)}")
print(f"Parsed emails with unresolved: {len(uids_unresolved)}")
print(f"Total job leads extracted from parsing: {parsed_lead_count}")
print(f"Total unresolved from parsing: {parsed_unresolved_count}")

# Check sourced coverage
sourced_uid_set = set(sourced_by_uid.keys())
leads_not_sourced = uids_with_leads - sourced_uid_set
if leads_not_sourced:
    print(f"\n*** Emails with leads but NO sourced files: {len(leads_not_sourced)} ***")
    for uid in sorted(leads_not_sourced, key=int):
        raw = load_json(RAW_DIR / f"{uid}.json")
        print(f"  UID {uid}: {raw.get('subject', '?')[:80]}")
else:
    print("\nAll emails with leads have sourced files.")

# ─────────────────────────────────────────────────────
# 6. Review Queue Analysis
# ─────────────────────────────────────────────────────
section("6. REVIEW QUEUE ANALYSIS")

rq = load_json(REVIEW_QUEUE)
rq_leads = rq.get("leads", [])
rq_skipped = rq.get("auto_skipped", [])
rq_unresolved = rq.get("unresolved", [])

print(f"Review queue batch_id: {rq.get('batch_id', '?')}")
print(f"  Leads (ranked): {len(rq_leads)}")
print(f"  Auto-skipped: {len(rq_skipped)}")
print(f"  Unresolved: {len(rq_unresolved)}")
print(f"  Total in review queue: {len(rq_leads) + len(rq_skipped) + len(rq_unresolved)}")

# Compare sourced leads to review queue
all_rq_items = rq_leads + rq_skipped + rq_unresolved
rq_uid_set = set()
for item in all_rq_items:
    uid = item.get("email_uid", "")
    if uid:
        rq_uid_set.add(str(uid))

sourced_not_in_rq = sourced_uid_set - rq_uid_set
if sourced_not_in_rq:
    print(f"\n*** Sourced leads from emails NOT in review queue: UIDs {sorted(sourced_not_in_rq, key=int)} ***")
    for uid in sorted(sourced_not_in_rq, key=int):
        files = sourced_by_uid[uid]
        for f in files:
            lead = load_json(SOURCED_DIR / f)
            lead_data = lead.get("lead", lead)
            print(f"  {f}: {lead_data.get('company','?')} — {lead_data.get('role','?')}")

# ─────────────────────────────────────────────────────
# 7. Bad Data Detection
# ─────────────────────────────────────────────────────
section("7. BAD DATA DETECTION")

BAD_VALUES = {"?", "unknown", "Unknown", "", None, "N/A", "n/a", "TBD"}

subsection("Review Queue Leads with Bad Data")
bad_leads = []
for item in rq_leads:
    company = item.get("company", "")
    role = item.get("role", "")
    issues = []
    if company in BAD_VALUES or (isinstance(company, str) and company.strip().lower() in {"?", "unknown", "", "n/a", "tbd"}):
        issues.append(f"bad company='{company}'")
    if role in BAD_VALUES or (isinstance(role, str) and role.strip().lower() in {"?", "unknown", "", "n/a", "tbd"}):
        issues.append(f"bad role='{role}'")
    if not item.get("score"):
        issues.append("missing score")
    if issues:
        bad_leads.append((item, issues))

if bad_leads:
    print(f"*** {len(bad_leads)} leads with bad data: ***")
    for item, issues in bad_leads:
        print(f"  [{item.get('email_uid','')}] {item.get('company','?')} — {item.get('role','?')}: {', '.join(issues)}")
else:
    print("No leads with bad company/role data found in review queue.")

subsection("Auto-Skipped with Bad Data")
bad_skipped = []
for item in rq_skipped:
    company = item.get("company", "")
    role = item.get("role", "")
    issues = []
    if isinstance(company, str) and company.strip().lower() in {"?", "unknown", "", "n/a", "tbd"}:
        issues.append(f"bad company='{company}'")
    if isinstance(role, str) and role.strip().lower() in {"?", "unknown", "", "n/a", "tbd"}:
        issues.append(f"bad role='{role}'")
    if issues:
        bad_skipped.append((item, issues))

if bad_skipped:
    print(f"*** {len(bad_skipped)} auto-skipped with bad data: ***")
    for item, issues in bad_skipped:
        print(f"  [{item.get('email_uid','')}] {item.get('company','?')} — {item.get('role','?')}: {', '.join(issues)}")
else:
    print("No auto-skipped entries with bad data.")

subsection("Unresolved Leads")
if rq_unresolved:
    print(f"{len(rq_unresolved)} unresolved leads:")
    for item in rq_unresolved:
        print(f"  [{item.get('email_uid','')}] {item.get('company','?')} — {item.get('role','?')}: {item.get('reason','?')}")
else:
    print("No unresolved leads.")

subsection("Sourced Leads with Bad Data")
bad_sourced = []
for uid, files in sorted(sourced_by_uid.items(), key=lambda x: int(x[0])):
    for f in files:
        lead_data = load_json(SOURCED_DIR / f)
        lead = lead_data.get("lead", lead_data)
        company = lead.get("company", "")
        role = lead.get("role", "")
        issues = []
        if isinstance(company, str) and company.strip().lower() in {"?", "unknown", "", "n/a", "tbd"}:
            issues.append(f"bad company='{company}'")
        if isinstance(role, str) and role.strip().lower() in {"?", "unknown", "", "n/a", "tbd"}:
            issues.append(f"bad role='{role}'")
        if issues:
            bad_sourced.append((f, lead, issues))

if bad_sourced:
    print(f"*** {len(bad_sourced)} sourced leads with bad data: ***")
    for fname, lead, issues in bad_sourced:
        print(f"  {fname}: {lead.get('company','?')} — {lead.get('role','?')}: {', '.join(issues)}")
else:
    print("No sourced leads with bad data.")

# ─────────────────────────────────────────────────────
# 8. Parsed Email Detail — Types Breakdown
# ─────────────────────────────────────────────────────
section("8. PARSED EMAIL TYPE BREAKDOWN")

type_counts = defaultdict(int)
for uid in parsed_files:
    parsed = load_json(PARSED_DIR / f"{uid}.json")
    leads = []
    if isinstance(parsed, list):
        leads = parsed
    elif isinstance(parsed, dict) and "leads" in parsed:
        leads = parsed["leads"]
    elif isinstance(parsed, dict):
        leads = [parsed]

    for entry in leads:
        t = entry.get("type", "unknown")
        type_counts[t] += 1

print("Lead types across all parsed emails:")
for t, count in sorted(type_counts.items(), key=lambda x: -x[1]):
    print(f"  {t}: {count}")

# ─────────────────────────────────────────────────────
# 9. Applications Directory
# ─────────────────────────────────────────────────────
section("9. APPLICATIONS DIRECTORY")

if APPLICATIONS.exists():
    app_dirs = [d for d in APPLICATIONS.iterdir() if d.is_dir()]
    print(f"Total application folders: {len(app_dirs)}")

    # Check for swooped-sourced applications
    swooped_apps = [d for d in app_dirs if "swooped" in d.name.lower()]
    print(f"Swooped-named folders: {len(swooped_apps)}")

    # Check how many have metadata.json
    has_metadata = sum(1 for d in app_dirs if (d / "metadata.json").exists())
    print(f"Folders with metadata.json: {has_metadata}")
    no_metadata = [d.name for d in app_dirs if not (d / "metadata.json").exists()]
    if no_metadata:
        print(f"Folders WITHOUT metadata.json: {len(no_metadata)}")
        for name in no_metadata[:10]:
            print(f"  {name}")
        if len(no_metadata) > 10:
            print(f"  ... and {len(no_metadata) - 10} more")
else:
    print("Applications directory not found.")

# ─────────────────────────────────────────────────────
# 10. Swooped Analysis
# ─────────────────────────────────────────────────────
section("10. SWOOPED ANALYSIS")

swooped_dir = PIPELINE / "swooped"
if swooped_dir.exists():
    swooped_files = list(swooped_dir.iterdir())
    print(f"Swooped directory: {len(swooped_files)} files (scripts only, no data exports)")
    # Check for any JSON data files
    swooped_json = [f for f in swooped_files if f.suffix == ".json"]
    if swooped_json:
        print(f"  JSON data files: {len(swooped_json)}")
    else:
        print("  No JSON data files — only extraction scripts.")

swooped_export_root = BASE / "swooped_export"
if swooped_export_root.exists():
    export_files = list(swooped_export_root.rglob("*.json"))
    print(f"\nSwooped export directory: {len(export_files)} JSON files")
else:
    print("No swooped_export/ directory at project root.")

# ─────────────────────────────────────────────────────
# 11. End-to-End Coverage Summary
# ─────────────────────────────────────────────────────
section("11. END-TO-END COVERAGE SUMMARY")

print(f"""
Gmail INBOX emails:        {len(gmail_emails) if gmail_emails else 'N/A (no connection)'}
Fingerprinted (fetched):   {len(fingerprints)}
Raw email files:           {len(raw_files)}
Parsed email files:        {len(parsed_files)}
Sourced lead files:        {len(sourced_files)} (from {len(sourced_by_uid)} emails)
Review queue leads:        {len(rq_leads)}
Review queue auto-skipped: {len(rq_skipped)}
Review queue unresolved:   {len(rq_unresolved)}
Total review queue items:  {len(rq_leads) + len(rq_skipped) + len(rq_unresolved)}
Application folders:       {len(app_dirs) if APPLICATIONS.exists() else 'N/A'}
""")

# Pipeline funnel
print("PIPELINE FUNNEL:")
if gmail_emails:
    print(f"  Gmail INBOX       -> Fetched:  {len(raw_files)}/{len(gmail_emails)} ({100*len(raw_files)/max(len(gmail_emails),1):.0f}%)")
print(f"  Fetched           -> Parsed:   {len(parsed_files)}/{len(raw_files)} ({100*len(parsed_files)/max(len(raw_files),1):.0f}%)")
print(f"  Parsed w/ leads   -> Sourced:  {len(sourced_by_uid)}/{len(uids_with_leads)} emails ({100*len(sourced_by_uid)/max(len(uids_with_leads),1):.0f}%)")
total_rq = len(rq_leads) + len(rq_skipped) + len(rq_unresolved)
print(f"  Sourced           -> Review Q: {total_rq} items from {len(rq_uid_set)} emails")

if gmail_emails:
    gap_count = len(set(gmail_emails.keys()) - raw_uid_set)
    if gap_count:
        print(f"\n  *** {gap_count} GMAIL EMAILS NOT IN PIPELINE — SEE SECTION 3 ***")

print("\nAudit complete.")
