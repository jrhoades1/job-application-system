"""
Email Pipeline — Step 1: Fetch

Connects to a dedicated Gmail account via IMAP, pulls unprocessed
forwarded job emails, and saves them as structured JSON to the
pipeline staging directory.

Usage:
    python email_fetch.py [--limit N] [--dry-run]
"""

import email
import email.policy
import hashlib
import imaplib
import json
import os
import re
import sys
from datetime import datetime

# Paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PIPELINE_DIR = os.path.join(SCRIPT_DIR, "pipeline")
STAGING_RAW = os.path.join(PIPELINE_DIR, "staging", "raw")
FINGERPRINTS_PATH = os.path.join(PIPELINE_DIR, "fingerprints.json")
CONFIG_PATH = os.path.join(SCRIPT_DIR, "pipeline_config.json")


def load_config():
    """Load pipeline configuration."""
    if not os.path.exists(CONFIG_PATH):
        print(f"  ERROR: Config not found at {CONFIG_PATH}")
        print("  Copy pipeline_config.json.example and fill in your settings.")
        sys.exit(1)

    with open(CONFIG_PATH, encoding="utf-8") as f:
        config = json.load(f)

    # Validate required fields
    email_cfg = config.get("email", {})
    if not email_cfg.get("address") or email_cfg["address"] == "CHANGE_ME@gmail.com":
        print("  ERROR: Set your Gmail address in pipeline_config.json")
        sys.exit(1)

    return config


def get_app_password(config):
    """Read the Gmail app password from the environment variable."""
    env_var = config["email"].get("app_password_env", "JOB_PIPELINE_GMAIL_APP_PASSWORD")
    password = os.environ.get(env_var)
    if not password:
        print(f"  ERROR: Environment variable '{env_var}' is not set.")
        print(f"  Set it with: export {env_var}='xxxx-xxxx-xxxx-xxxx'")
        print("  Generate an app password at: Google Account > Security > 2-Step Verification > App passwords")
        sys.exit(1)
    return password


def connect_imap(config):
    """Connect to Gmail IMAP using app-specific password."""
    email_cfg = config["email"]
    host = email_cfg.get("imap_host", "imap.gmail.com")
    port = email_cfg.get("imap_port", 993)
    address = email_cfg["address"]
    password = get_app_password(config)

    try:
        conn = imaplib.IMAP4_SSL(host, port)
        conn.login(address, password)
        print(f"  Connected to {host} as {address}")
        return conn
    except imaplib.IMAP4.error as e:
        print(f"  ERROR: IMAP login failed: {e}")
        print("  Check your email address and app password.")
        sys.exit(1)


def get_unprocessed_emails(conn, config, limit=50):
    """Fetch emails from INBOX not yet processed.

    Uses IMAP SEARCH to find emails not labeled as processed or failed.
    Returns list of parsed email dicts.
    """
    labels = config["email"].get("labels", {})
    _processed_label = labels.get("processed", "pipeline/processed")
    _failed_label = labels.get("failed", "pipeline/failed")

    # Select INBOX
    conn.select("INBOX")

    # Search for all emails (we'll filter by checking labels/flags)
    # Gmail IMAP: unlabeled emails in INBOX that haven't been moved
    status, data = conn.search(None, "ALL")
    if status != "OK":
        print("  ERROR: Could not search INBOX")
        return []

    uids = data[0].split()
    if not uids:
        print("  No emails found in INBOX.")
        return []

    # Check which UIDs are already processed via our fingerprint file
    fingerprints = load_fingerprints()
    processed_uids = set(fingerprints.values())  # uid strings we've already seen

    # Filter to unprocessed, apply limit
    unprocessed_uids = [uid for uid in uids if uid.decode() not in processed_uids]
    if limit:
        unprocessed_uids = unprocessed_uids[-limit:]  # Most recent first

    if not unprocessed_uids:
        print("  No unprocessed emails found.")
        return []

    print(f"  Found {len(unprocessed_uids)} unprocessed emails (of {len(uids)} total)")

    emails = []
    for uid in unprocessed_uids:
        uid_str = uid.decode()
        status, msg_data = conn.fetch(uid, "(RFC822)")
        if status != "OK":
            print(f"  WARNING: Could not fetch UID {uid_str}")
            continue

        raw_email = msg_data[0][1]
        msg = email.message_from_bytes(raw_email, policy=email.policy.default)

        email_dict = parse_email_message(msg, uid_str)
        if email_dict:
            emails.append(email_dict)

    return emails


def parse_email_message(msg, uid):
    """Parse an email.message.Message into a structured dict."""
    # Extract headers
    from_addr = str(msg.get("From", ""))
    subject = str(msg.get("Subject", ""))
    date_str = str(msg.get("Date", ""))
    to_addr = str(msg.get("To", ""))
    message_id = str(msg.get("Message-ID", ""))

    # Extract body (text and HTML)
    body_text = ""
    body_html = ""

    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            content_disposition = str(part.get("Content-Disposition", ""))

            # Skip attachments
            if "attachment" in content_disposition:
                continue

            try:
                payload = part.get_content()
            except Exception:
                continue

            if content_type == "text/plain" and isinstance(payload, str):
                body_text += payload
            elif content_type == "text/html" and isinstance(payload, str):
                body_html += payload
    else:
        content_type = msg.get_content_type()
        try:
            payload = msg.get_content()
        except Exception:
            payload = ""

        if isinstance(payload, str):
            if content_type == "text/html":
                body_html = payload
            else:
                body_text = payload

    return {
        "uid": uid,
        "from": from_addr,
        "to": to_addr,
        "subject": subject,
        "date": date_str,
        "message_id": message_id,
        "body_text": body_text,
        "body_html": body_html,
        "fetched_at": datetime.now().isoformat(),
    }


def detect_forwarded_content(email_dict):
    """Extract the original forwarded email content.

    Handles Gmail and Outlook forward formats, plus plain-text forwards.
    Returns dict with original_from, original_subject, original_body, or
    the email content as-is if not a forward.
    """
    subject = email_dict.get("subject", "")

    result = {
        "original_from": email_dict["from"],
        "original_subject": subject,
        "original_body_text": email_dict.get("body_text", ""),
        "original_body_html": email_dict.get("body_html", ""),
        "is_forwarded": False,
        "forward_wrapper_from": None,
    }

    # Detect "Fwd:" or "FW:" in subject
    fwd_match = re.match(r'^(?:Fwd?|FW):\s*(.+)$', subject, re.IGNORECASE)
    if fwd_match:
        result["original_subject"] = fwd_match.group(1).strip()
        result["is_forwarded"] = True
        result["forward_wrapper_from"] = email_dict["from"]

    # Try to extract original sender from forwarded content
    # Gmail format: "---------- Forwarded message ---------\nFrom: ..."
    # Outlook format: "From: ... Sent: ... To: ... Subject: ..."
    text = email_dict.get("body_text", "")

    # Gmail forward header pattern
    gmail_fwd = re.search(
        r'-+\s*Forwarded message\s*-+\s*\n'
        r'From:\s*(.+?)\n'
        r'Date:\s*(.+?)\n'
        r'Subject:\s*(.+?)\n'
        r'To:\s*(.+?)\n',
        text, re.IGNORECASE
    )
    if gmail_fwd:
        result["original_from"] = gmail_fwd.group(1).strip()
        result["original_subject"] = gmail_fwd.group(3).strip()
        result["is_forwarded"] = True
        result["forward_wrapper_from"] = email_dict["from"]
        # Body after the forward header
        fwd_end = gmail_fwd.end()
        result["original_body_text"] = text[fwd_end:].strip()

    # Outlook forward header pattern
    outlook_fwd = re.search(
        r'From:\s*(.+?)\s*\n'
        r'Sent:\s*(.+?)\s*\n'
        r'To:\s*(.+?)\s*\n'
        r'Subject:\s*(.+?)\s*\n',
        text, re.IGNORECASE
    )
    if not gmail_fwd and outlook_fwd:
        result["original_from"] = outlook_fwd.group(1).strip()
        result["original_subject"] = outlook_fwd.group(4).strip()
        result["is_forwarded"] = True
        result["forward_wrapper_from"] = email_dict["from"]
        fwd_end = outlook_fwd.end()
        result["original_body_text"] = text[fwd_end:].strip()

    return result


def compute_email_fingerprint(email_dict):
    """SHA256 of (sender + subject + first 500 chars of body).

    Used to detect same email forwarded twice.
    """
    sender = email_dict.get("from", "")
    subject = email_dict.get("subject", "")
    body = (email_dict.get("body_text", "") or email_dict.get("body_html", ""))[:500]

    content = f"{sender}|{subject}|{body}"
    return hashlib.sha256(content.encode("utf-8")).hexdigest()[:16]


def load_fingerprints():
    """Load the email fingerprint dedup index."""
    if os.path.exists(FINGERPRINTS_PATH):
        with open(FINGERPRINTS_PATH, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_fingerprints(fingerprints):
    """Save the email fingerprint dedup index."""
    os.makedirs(os.path.dirname(FINGERPRINTS_PATH), exist_ok=True)
    with open(FINGERPRINTS_PATH, "w", encoding="utf-8") as f:
        json.dump(fingerprints, f, indent=2)


def save_raw_email(email_dict, staging_dir=STAGING_RAW):
    """Save raw email as JSON to staging/raw/{uid}.json.

    Returns the file path. Idempotent: skips if file already exists.
    """
    os.makedirs(staging_dir, exist_ok=True)
    uid = email_dict["uid"]
    filepath = os.path.join(staging_dir, f"{uid}.json")

    if os.path.exists(filepath):
        return filepath, False

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(email_dict, f, indent=2, ensure_ascii=False)

    return filepath, True


def label_email(conn, uid, label):
    """Apply a Gmail label (IMAP folder copy) to mark email as processed.

    Gmail uses labels as virtual folders. We copy the message to the label
    folder and optionally remove from INBOX.
    """
    try:
        # Gmail labels can be created as IMAP folders
        # First try to create the label folder (idempotent - fails silently if exists)
        conn.create(label)
    except imaplib.IMAP4.error:
        pass  # Label already exists

    try:
        conn.select("INBOX")
        # Copy message to the label folder
        conn.copy(uid.encode() if isinstance(uid, str) else uid, label)
    except imaplib.IMAP4.error as e:
        print(f"  WARNING: Could not label email {uid}: {e}")


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Fetch job emails from Gmail")
    parser.add_argument("--limit", type=int, default=50, help="Max emails to fetch")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be fetched without saving")
    args = parser.parse_args()

    print("=" * 60)
    print("  EMAIL PIPELINE — STEP 1: FETCH")
    print("=" * 60)

    # Load config
    config = load_config()

    # Connect
    print("\n  Connecting to Gmail...")
    conn = connect_imap(config)

    try:
        # Fetch unprocessed emails
        print("\n  Fetching unprocessed emails...")
        emails = get_unprocessed_emails(conn, config, limit=args.limit)

        if not emails:
            print("\n  No new emails to process.")
            return

        # Load fingerprint index for dedup
        fingerprints = load_fingerprints()

        # Process each email
        saved = 0
        dupes = 0
        for email_dict in emails:
            fp = compute_email_fingerprint(email_dict)

            # Check for duplicate (same email forwarded twice)
            if fp in fingerprints:
                dupes += 1
                if not args.dry_run:
                    label_email(conn, email_dict["uid"],
                                config["email"]["labels"]["processed"])
                continue

            if args.dry_run:
                print(f"    [DRY RUN] Would save: {email_dict['subject'][:60]}")
                saved += 1
                continue

            # Detect and annotate forwarded content
            fwd_info = detect_forwarded_content(email_dict)
            email_dict["forward_info"] = fwd_info

            # Save raw email
            filepath, was_saved = save_raw_email(email_dict)
            if was_saved:
                saved += 1
                fingerprints[fp] = email_dict["uid"]

                # Label as processed in Gmail
                label_email(conn, email_dict["uid"],
                            config["email"]["labels"]["processed"])

        # Save updated fingerprints
        if not args.dry_run:
            save_fingerprints(fingerprints)

        # Summary
        print("\n  Results:")
        print(f"    Fetched:    {len(emails)}")
        print(f"    Saved:      {saved}")
        print(f"    Duplicates: {dupes}")
        print(f"    Staging:    {STAGING_RAW}")

    finally:
        conn.logout()

    print(f"\n{'=' * 60}")
    print(f"  FETCH COMPLETE — {saved} emails ready for parsing")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
