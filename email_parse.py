"""
Email Pipeline — Step 2: Parse

Reads raw email JSON files from staging/raw/ and extracts structured
job leads: company name, role title, source platform, confidence.

Handles multi-job emails (LinkedIn "Jobs you might like"), single-job
notifications, recruiter outreach, and accidental non-job forwards.

Usage:
    python email_parse.py [--reparse]
"""

import json
import os
import re
from html.parser import HTMLParser

# Paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PIPELINE_DIR = os.path.join(SCRIPT_DIR, "pipeline")
STAGING_RAW = os.path.join(PIPELINE_DIR, "staging", "raw")
STAGING_PARSED = os.path.join(PIPELINE_DIR, "staging", "parsed")
CONFIG_PATH = os.path.join(SCRIPT_DIR, "pipeline_config.json")


# ---------------------------------------------------------------------------
# HTML text extraction
# ---------------------------------------------------------------------------

class HTMLTextExtractor(HTMLParser):
    """Strip HTML tags and extract clean text."""

    def __init__(self):
        super().__init__()
        self._text = []
        self._skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self._skip = True

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self._skip = False
        if tag in ("br", "p", "div", "tr", "li", "h1", "h2", "h3", "h4"):
            self._text.append("\n")

    def handle_data(self, data):
        if not self._skip:
            self._text.append(data)

    def get_text(self):
        return "".join(self._text)


def html_to_text(html):
    """Convert HTML string to plain text."""
    if not html:
        return ""
    extractor = HTMLTextExtractor()
    try:
        extractor.feed(html)
        return extractor.get_text()
    except Exception:
        return html


# ---------------------------------------------------------------------------
# Sender detection
# ---------------------------------------------------------------------------

def get_sender_domain(from_addr):
    """Extract domain from From: header.

    'Joe Smith <joe@linkedin.com>' -> 'linkedin.com'
    'noreply@indeed.com' -> 'indeed.com'
    """
    match = re.search(r'@([\w.-]+)', from_addr)
    if match:
        domain = match.group(1).lower()
        # Normalize subdomains: email.linkedin.com -> linkedin.com
        parts = domain.split(".")
        if len(parts) > 2:
            domain = ".".join(parts[-2:])
        return domain
    return ""


def load_config():
    """Load pipeline configuration."""
    if not os.path.exists(CONFIG_PATH):
        return {"sender_templates": {}, "company_aliases": {}}
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Forward detection
# ---------------------------------------------------------------------------

def _enrich_forwarded_email(email_dict):
    """If email is forwarded, extract original sender and enrich the dict.

    Adds _original_from, _original_subject, _is_forwarded keys.
    Handles Outlook "Fw:" and Gmail "Fwd:" forward formats.
    """
    subject = email_dict.get("subject", "")
    body_text = email_dict.get("body_text", "") or html_to_text(email_dict.get("body_html", ""))

    is_forwarded = bool(re.match(r'^(?:Fw|Fwd|FW):\s*', subject, re.IGNORECASE))
    if not is_forwarded:
        email_dict["_is_forwarded"] = False
        return email_dict

    email_dict["_is_forwarded"] = True

    # Try Outlook/Hotmail format: ____\nFrom: ...\nSent: ...\nTo: ...\nSubject: ...
    outlook_fwd = re.search(
        r'(?:_{3,}|-{3,})\s*\n'
        r'From:\s*(.+?)\s*\n'
        r'Sent:\s*(.+?)\s*\n'
        r'To:\s*(.+?)\s*\n'
        r'Subject:\s*(.+?)\s*\n',
        body_text, re.IGNORECASE
    )
    if outlook_fwd:
        email_dict["_original_from"] = outlook_fwd.group(1).strip()
        email_dict["_original_subject"] = outlook_fwd.group(4).strip()
        return email_dict

    # Try Gmail format: ---------- Forwarded message ----------\nFrom: ...
    gmail_fwd = re.search(
        r'-+\s*Forwarded message\s*-+\s*\n'
        r'From:\s*(.+?)\n',
        body_text, re.IGNORECASE
    )
    if gmail_fwd:
        email_dict["_original_from"] = gmail_fwd.group(1).strip()
        subj_match = re.search(r'Subject:\s*(.+?)\n', body_text[gmail_fwd.start():])
        if subj_match:
            email_dict["_original_subject"] = subj_match.group(1).strip()
        return email_dict

    return email_dict


# ---------------------------------------------------------------------------
# Email classification
# ---------------------------------------------------------------------------

def classify_email(email_dict, sender_templates):
    """Classify the email type.

    Returns: 'single_job', 'multi_job', 'recruiter_generic', 'not_job', 'unknown'
    """
    from_addr = email_dict.get("from", "")
    subject = email_dict.get("subject", "")
    body_text = email_dict.get("body_text", "") or html_to_text(email_dict.get("body_html", ""))

    # Detect non-job emails
    if detect_non_job_email(email_dict):
        return "not_job"

    # Use original sender if this is a forwarded email
    effective_from = email_dict.get("_original_from", from_addr)
    domain = get_sender_domain(effective_from)
    sender_config = sender_templates.get(domain, sender_templates.get("_default", {}))

    # Check for multi-job indicator
    multi_indicator = sender_config.get("multi_job_indicator", "")
    if multi_indicator:
        # Strip invisible Unicode spacers and URLs for a cleaner check window
        clean_body = re.sub(r'[\u034f\u200b-\u200f\u2028\u2029\u00ad]+', '', body_text)
        clean_body = re.sub(r'<https?://[^>]+>', '', clean_body)
        combined = f"{subject} {clean_body[:2000]}".lower()
        if re.search(multi_indicator, combined, re.IGNORECASE):
            return "multi_job"

    # LinkedIn "and more" in subject indicates multi-job alert
    if domain == "linkedin.com" and re.search(r'\band more\b', subject, re.IGNORECASE):
        return "multi_job"

    # Check if it matches a job board sender
    if sender_config.get("type") == "job_board":
        return "single_job"

    # Check for recruiter patterns
    if sender_config.get("type") == "recruiter" or _looks_like_recruiter(from_addr, subject, body_text):
        # Check if specific job is mentioned
        if _has_specific_job(subject, body_text):
            return "single_job"
        return "recruiter_generic"

    # Fallback: check body for job-like content
    if _has_specific_job(subject, body_text):
        return "single_job"

    return "unknown"


def detect_non_job_email(email_dict):
    """Heuristics for non-job emails accidentally forwarded."""
    subject = email_dict.get("subject", "").lower()
    body = (email_dict.get("body_text", "") or "")[:1000].lower()

    # Newsletter/promotional patterns
    non_job_patterns = [
        r"unsubscribe",
        r"weekly digest",
        r"newsletter",
        r"your (?:weekly|daily|monthly) (?:summary|recap|update)",
        r"connection request",
        r"accepted your invitation",
        r"endorsed you",
        r"happy birthday",
        r"congratulations on your work anniversary",
        r"profile view",
        r"who.s viewed your profile",
        r"invitation to connect",
    ]

    combined = f"{subject} {body}"
    for pattern in non_job_patterns:
        if re.search(pattern, combined, re.IGNORECASE):
            # Some newsletters mention jobs — check for job-specific content
            if _has_specific_job(subject, body):
                return False
            return True

    return False


def _looks_like_recruiter(from_addr, subject, body):
    """Detect recruiter outreach patterns."""
    recruiter_signals = [
        r"opportunity",
        r"exciting role",
        r"position.+(?:available|open)",
        r"perfect (?:fit|match|candidate)",
        r"client.+(?:is hiring|looking for)",
        r"i came across your profile",
        r"your background",
        r"reaching out",
    ]
    combined = f"{subject} {body[:500]}".lower()
    return any(re.search(p, combined, re.IGNORECASE) for p in recruiter_signals)


def _has_specific_job(subject, body):
    """Check if email contains a specific job posting (company + role)."""
    combined = f"{subject} {body[:1000]}"
    # Look for patterns like "Role at Company" or "Company is hiring for Role"
    job_patterns = [
        r'(?:director|vp|vice president|manager|engineer|architect|lead|head|chief)\s+(?:of\s+)?\w+.+?at\s+\w+',
        r'\w+\s+is\s+(?:hiring|looking)\s+(?:for\s+)?(?:a\s+)?\w+',
        r'(?:position|role|opportunity):\s*\w+',
        r'(?:apply|apply now|view job|see job)',
    ]
    return any(re.search(p, combined, re.IGNORECASE) for p in job_patterns)


# ---------------------------------------------------------------------------
# Parsing strategies
# ---------------------------------------------------------------------------

def parse_single_job_email(email_dict, sender_config, alias_map):
    """Extract company and role from a single-job notification.

    Returns dict with company, role, source_platform, confidence.
    """
    subject = email_dict.get("subject", "")
    body_text = email_dict.get("body_text", "") or html_to_text(email_dict.get("body_html", ""))
    from_addr = email_dict.get("from", "")
    domain = get_sender_domain(from_addr)

    # Try subject patterns first
    company = None
    role = None
    confidence = 0.0

    subject_patterns = sender_config.get("subject_patterns", [])
    for pattern in subject_patterns:
        match = re.search(pattern, subject, re.IGNORECASE)
        if match:
            groups = match.groupdict()
            if "company" in groups:
                company = groups["company"].strip()
            if "role" in groups:
                role = groups["role"].strip()
            if company or role:
                confidence = 0.8
                break

    # If subject didn't yield enough, try body
    if not company or not role:
        body_company, body_role, body_confidence = _extract_from_body(body_text, domain)
        if not company and body_company:
            company = body_company
            confidence = max(confidence, body_confidence - 0.1)
        if not role and body_role:
            role = body_role
            confidence = max(confidence, body_confidence - 0.1)

    # Normalize
    if company:
        company = resolve_company_name(company, alias_map)
    if role:
        role = normalize_role_title(role)

    if not company and not role:
        return None

    return {
        "company": company or "Unknown",
        "role": role or "Unknown Role",
        "source_platform": domain.split(".")[0].title() if domain else "Email",
        "confidence": round(confidence, 2),
    }


def parse_multi_job_email(email_dict, sender_config, alias_map):
    """Parse 'Jobs you might like' type emails.

    Returns list of {company, role, source_platform, confidence}.
    """
    body_html = email_dict.get("body_html", "")
    body_text = email_dict.get("body_text", "") or html_to_text(body_html)
    effective_from = email_dict.get("_original_from", email_dict.get("from", ""))
    domain = get_sender_domain(effective_from)
    strategy = sender_config.get("body_parse_strategy", "generic")

    leads = []

    if strategy == "linkedin_cards":
        leads = _parse_linkedin_cards(body_html, body_text)
    elif strategy == "indeed_list":
        leads = _parse_indeed_list(body_html, body_text)
    elif strategy == "glassdoor_cards":
        leads = _parse_generic_job_list(body_html, body_text)
    elif strategy == "ziprecruiter_list":
        leads = _parse_generic_job_list(body_html, body_text)
    elif strategy == "dice_list":
        leads = _parse_generic_job_list(body_html, body_text)
    else:
        leads = _parse_generic_job_list(body_html, body_text)

    # Normalize all results
    platform = domain.split(".")[0].title() if domain else "Email"
    for lead in leads:
        lead["source_platform"] = platform
        if lead.get("company"):
            lead["company"] = resolve_company_name(lead["company"], alias_map)
        if lead.get("role"):
            lead["role"] = normalize_role_title(lead["role"])

    return [lead for lead in leads if lead.get("company") and lead.get("role")]


def _parse_linkedin_cards(body_html, body_text):
    """Parse LinkedIn multi-job email format.

    LinkedIn job alert emails have this text structure:
        [CompanyName] <url>    <url>
        Role Title <url>
        CompanyName · Location (Remote/Hybrid/etc.)
        Optional: $salary / year
        Optional: badges like [Easy Apply]

    The "Company · Location" line (with middle dot ·) is the key marker.
    """
    leads = []

    # Primary: parse plain text using the "Company · Location" pattern
    if body_text:
        leads = _parse_linkedin_text_cards(body_text)

    # Fallback: generic text blocks
    if not leads:
        leads = _parse_text_job_blocks(body_text)

    return leads


def _parse_linkedin_text_cards(text):
    """Parse LinkedIn multi-job text using the 'Company · Location' pattern."""
    leads = []
    lines = text.split('\n')

    for i, line in enumerate(lines):
        stripped = line.strip()

        # Match "Company · Location" pattern (· is U+00B7 middle dot)
        dot_match = re.match(r'^([^·<\[\(]+?)\s*·\s*(.+)$', stripped)
        if not dot_match:
            continue

        company = dot_match.group(1).strip()
        location = dot_match.group(2).strip()

        # Skip non-company lines
        if not company or len(company) < 2 or len(company) > 60:
            continue
        if any(x in company.lower() for x in
               ['unsubscribe', 'copyright', 'linkedin', 'see all', '©']):
            continue

        # Look backward for role title (1-4 lines above)
        role = None
        for j in range(i - 1, max(-1, i - 5), -1):
            if j < 0:
                break
            prev_line = lines[j].strip()
            # Strip URL suffixes: "VP, Engineering <https://...>"
            prev_clean = re.sub(r'\s*<https?://[^>]+>\s*', '', prev_line).strip()
            # Strip markdown link prefix: "[text] <url>"
            prev_clean = re.sub(r'^\[.*?\]\s*', '', prev_clean).strip()
            # Skip empty, URL-only, and badge/icon lines
            if not prev_clean or prev_clean.startswith('<') or prev_clean.startswith('['):
                continue
            if prev_clean.startswith('http'):
                continue

            if _is_likely_role(prev_clean) and len(prev_clean) < 100:
                role = prev_clean
                break

        if role and company:
            # Extract salary if on the next line
            salary = None
            if i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                salary_match = re.match(r'^\$[\d,]+K?\s*[-–]\s*\$[\d,]+K?', next_line)
                if salary_match:
                    salary = salary_match.group(0)

            lead = {
                "company": company,
                "role": role,
                "location": location,
                "confidence": 0.85,
            }
            if salary:
                lead["salary_range"] = salary
            leads.append(lead)

    return leads


def _parse_indeed_list(body_html, body_text):
    """Parse Indeed multi-job email format."""
    leads = []

    # Indeed emails typically have: "Role\nCompany - Location"
    text = body_text or html_to_text(body_html)
    pattern = re.compile(
        r'(?P<role>[A-Z][^\n]{5,80})\n'
        r'(?P<company>[A-Z][^\n-]{2,60})\s*[-–]\s*(?P<location>[^\n]+)',
        re.MULTILINE
    )
    for match in pattern.finditer(text):
        role = match.group("role").strip()
        company = match.group("company").strip()
        if _is_likely_role(role) and _is_likely_company(company):
            leads.append({
                "company": company,
                "role": role,
                "confidence": 0.7,
            })

    if not leads:
        leads = _parse_text_job_blocks(text)

    return leads


def _parse_generic_job_list(body_html, body_text):
    """Generic parser for multi-job emails from any source."""
    text = body_text or html_to_text(body_html)
    return _parse_text_job_blocks(text)


def _parse_text_job_blocks(text):
    """Extract job leads from plain text using common patterns."""
    leads = []

    # Pattern 1: "Role at Company"
    at_pattern = re.compile(
        r'(?P<role>(?:Senior|Sr\.?|Junior|Jr\.?|Lead|Staff|Principal|Chief|'
        r'Director|VP|Vice President|Head|Manager|Engineer|Architect|'
        r'Developer|Designer|Analyst|Scientist|Consultant)[^\n]{0,60}?)'
        r'\s+at\s+'
        r'(?P<company>[A-Z][^\n,]{1,60})',
        re.IGNORECASE | re.MULTILINE
    )
    for match in at_pattern.finditer(text):
        leads.append({
            "company": match.group("company").strip(),
            "role": match.group("role").strip(),
            "confidence": 0.75,
        })

    # Pattern 2: "Company - Role" or "Company | Role"
    if not leads:
        sep_pattern = re.compile(
            r'(?P<company>[A-Z][^\n|–-]{2,40})\s*[|–-]\s*'
            r'(?P<role>(?:Senior|Sr|Lead|Staff|Principal|Director|VP|'
            r'Head|Manager|Engineer|Architect|Developer)[^\n]{0,60})',
            re.MULTILINE
        )
        for match in sep_pattern.finditer(text):
            leads.append({
                "company": match.group("company").strip(),
                "role": match.group("role").strip(),
                "confidence": 0.6,
            })

    return leads


def _is_likely_role(text):
    """Check if text looks like a job title."""
    role_keywords = [
        "director", "manager", "engineer", "developer", "architect",
        "lead", "head", "vp", "vice president", "chief", "officer",
        "senior", "staff", "principal", "analyst", "scientist",
        "designer", "consultant", "coordinator", "specialist",
    ]
    lower = text.lower()
    return any(kw in lower for kw in role_keywords)


def _is_likely_company(text):
    """Check if text looks like a company name (not boilerplate)."""
    # Reject common email boilerplate
    non_company = [
        "unsubscribe", "view in browser", "privacy policy", "terms of",
        "click here", "learn more", "see all", "view all",
        "this email", "was sent", "copyright", "all rights",
    ]
    lower = text.lower().strip()
    if len(lower) < 2 or len(lower) > 60:
        return False
    return not any(nc in lower for nc in non_company)


def _extract_from_body(body_text, domain):
    """Try to extract company and role from email body text."""
    company = None
    role = None
    confidence = 0.5

    # "Role at Company" pattern
    at_match = re.search(
        r'(?P<role>(?:Senior|Sr\.?|Director|VP|Vice President|Head|Manager|'
        r'Lead|Chief|Engineer|Architect|Principal)[^.\n]{0,60}?)'
        r'\s+at\s+'
        r'(?P<company>[A-Z][^.\n,]{1,60})',
        body_text, re.IGNORECASE
    )
    if at_match:
        role = at_match.group("role").strip()
        company = at_match.group("company").strip()
        confidence = 0.7

    # "Company is hiring" pattern
    if not company:
        hiring_match = re.search(
            r'(?P<company>[A-Z][^\n]{1,40})\s+is\s+(?:hiring|looking for)',
            body_text
        )
        if hiring_match:
            company = hiring_match.group("company").strip()
            confidence = 0.5

    return company, role, confidence


# ---------------------------------------------------------------------------
# Recruiter email parsing
# ---------------------------------------------------------------------------

def parse_recruiter_email(email_dict, alias_map):
    """Handle recruiter outreach emails.

    Returns dict with recruiter info and any job details found.
    """
    from_addr = email_dict.get("from", "")
    subject = email_dict.get("subject", "")
    body_text = email_dict.get("body_text", "") or html_to_text(email_dict.get("body_html", ""))

    # Extract recruiter name from From header
    recruiter_name = ""
    name_match = re.match(r'^"?([^"<]+)"?\s*<', from_addr)
    if name_match:
        recruiter_name = name_match.group(1).strip()

    recruiter_company = get_sender_domain(from_addr)

    # Try to find the actual hiring company
    target_company = None
    role_hint = None

    # Look for "at Company" or "with Company" or "for Company"
    company_match = re.search(
        r'(?:at|with|for|client)\s+(?:is\s+)?(?P<company>[A-Z][^\n,.]{2,40})',
        body_text
    )
    if company_match:
        target_company = company_match.group("company").strip()

    # Look for role mentions
    role_match = re.search(
        r'(?:role|position|opportunity)\s*(?:of|for|as|:)\s*(?P<role>[^\n.]{5,60})',
        body_text, re.IGNORECASE
    )
    if role_match:
        role_hint = role_match.group("role").strip()

    # Also check subject line
    if not role_hint:
        subj_role = re.search(
            r'(?:Senior|Sr|Director|VP|Head|Manager|Lead|Chief|'
            r'Engineer|Architect|Principal)[^-|]*',
            subject, re.IGNORECASE
        )
        if subj_role:
            role_hint = subj_role.group(0).strip()

    # Detect staffing agency
    is_staffing_agency = False
    staffing_indicators = [
        "staffing", "recruiting", "talent", "placement", "robert half",
        "randstad", "adecco", "manpower", "kelly services", "hays",
        "insight global", "tek systems", "kforce", "apex",
    ]
    if any(ind in recruiter_company.lower() or ind in from_addr.lower()
           for ind in staffing_indicators):
        is_staffing_agency = True

    if target_company:
        target_company = resolve_company_name(target_company, alias_map)
    if role_hint:
        role_hint = normalize_role_title(role_hint)

    return {
        "recruiter_name": recruiter_name,
        "recruiter_company": recruiter_company,
        "target_company": target_company,
        "role_hint": role_hint,
        "is_staffing_agency": is_staffing_agency,
        "confidence": 0.4 if not target_company else 0.6,
    }


# ---------------------------------------------------------------------------
# Normalization
# ---------------------------------------------------------------------------

def resolve_company_name(raw_name, alias_map):
    """Normalize company names using alias mapping.

    Looks up the raw name against known aliases and returns the canonical name.
    """
    if not raw_name:
        return raw_name

    cleaned = raw_name.strip()
    # Remove common suffixes
    cleaned = re.sub(r'\s*(?:Inc\.?|LLC|Ltd\.?|Corp\.?|Corporation|Co\.?|Group)\s*$',
                     '', cleaned, flags=re.IGNORECASE).strip()

    lower = cleaned.lower()

    # Check if it's a canonical name
    if lower in alias_map:
        return cleaned

    # Check if it's an alias
    for canonical, aliases in alias_map.items():
        if lower in [a.lower() for a in aliases]:
            # Return in title case based on canonical
            return canonical.title()

    return cleaned


def normalize_role_title(raw_title):
    """Clean up role titles.

    Removes location suffixes, normalizes Sr/Senior, strips tracking codes.
    """
    if not raw_title:
        return raw_title

    title = raw_title.strip()

    # Remove tracking codes (e.g., "REQ-12345", "(R12345)", "(REQ12345)", "#12345")
    title = re.sub(r'\s*\((?:REQ|R|JR|ID)?[-#]?\d{4,}\)\s*', '', title).strip()
    title = re.sub(r'\s*#?\b(?:REQ|JR|ID)[-#]?\d{4,}\b\s*', '', title).strip()

    # Remove location suffixes (e.g., "- Remote", "- New York, NY")
    title = re.sub(r'\s*[-–|]\s*(?:Remote|Hybrid|On[- ]?site|[A-Z][a-z]+(?:,\s*[A-Z]{2})?)\s*$',
                   '', title).strip()

    # Normalize Sr./Senior and Jr./Junior (with dots)
    title = re.sub(r'\bSr\.\s*', 'Senior ', title)
    title = re.sub(r'\bSr\b(?!\.)', 'Senior', title)
    title = re.sub(r'\bJr\.\s*', 'Junior ', title)
    title = re.sub(r'\bJr\b(?!\.)', 'Junior', title)

    # Remove extra whitespace
    title = re.sub(r'\s+', ' ', title).strip()

    return title


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def process_raw_emails(reparse=False):
    """Process all raw email files not yet parsed."""
    config = load_config()
    sender_templates = config.get("sender_templates", {})
    alias_map = config.get("company_aliases", {})

    os.makedirs(STAGING_PARSED, exist_ok=True)

    # Find raw files to process
    if not os.path.exists(STAGING_RAW):
        print("  No raw emails found.")
        return {"total": 0, "parsed": 0, "not_job": 0, "unresolved": 0}

    raw_files = [f for f in os.listdir(STAGING_RAW) if f.endswith(".json")]
    if not raw_files:
        print("  No raw email files found.")
        return {"total": 0, "parsed": 0, "not_job": 0, "unresolved": 0}

    # Check which are already parsed
    if not reparse:
        parsed_files = set(os.listdir(STAGING_PARSED)) if os.path.exists(STAGING_PARSED) else set()
        raw_files = [f for f in raw_files if f not in parsed_files]

    if not raw_files:
        print("  All raw emails already parsed.")
        return {"total": 0, "parsed": 0, "not_job": 0, "unresolved": 0}

    print(f"  Processing {len(raw_files)} raw email files...")

    stats = {"total": len(raw_files), "parsed": 0, "not_job": 0, "unresolved": 0,
             "leads_found": 0, "multi_job": 0, "single_job": 0, "recruiter": 0}

    for filename in sorted(raw_files):
        filepath = os.path.join(STAGING_RAW, filename)
        with open(filepath, encoding="utf-8") as f:
            email_dict = json.load(f)

        uid = email_dict.get("uid", filename.replace(".json", ""))

        # Detect forwarded email and extract original sender
        _enrich_forwarded_email(email_dict)

        # Classify (uses original sender if forwarded)
        email_type = classify_email(email_dict, sender_templates)

        results = []

        if email_type == "not_job":
            stats["not_job"] += 1
            results = [{
                "type": "not_job",
                "reason": "Email classified as non-job content",
                "email_uid": uid,
                "email_date": email_dict.get("date", ""),
                "raw_subject": email_dict.get("subject", ""),
            }]

        elif email_type == "multi_job":
            stats["multi_job"] += 1
            effective_from = email_dict.get("_original_from", email_dict.get("from", ""))
            domain = get_sender_domain(effective_from)
            sender_config = sender_templates.get(domain, sender_templates.get("_default", {}))
            leads = parse_multi_job_email(email_dict, sender_config, alias_map)
            if leads:
                stats["leads_found"] += len(leads)
                for i, lead in enumerate(leads):
                    lead["email_uid"] = uid
                    lead["email_date"] = email_dict.get("date", "")
                    lead["raw_subject"] = email_dict.get("subject", "")
                    lead["lead_index"] = i
                    lead["type"] = "job_lead"
                results = leads
            else:
                stats["unresolved"] += 1
                results = [{
                    "type": "unresolved",
                    "reason": "Multi-job email but no leads extracted",
                    "email_uid": uid,
                    "email_date": email_dict.get("date", ""),
                    "raw_subject": email_dict.get("subject", ""),
                }]

        elif email_type == "single_job":
            stats["single_job"] += 1
            effective_from = email_dict.get("_original_from", email_dict.get("from", ""))
            domain = get_sender_domain(effective_from)
            sender_config = sender_templates.get(domain, sender_templates.get("_default", {}))
            lead = parse_single_job_email(email_dict, sender_config, alias_map)
            if lead:
                stats["leads_found"] += 1
                lead["email_uid"] = uid
                lead["email_date"] = email_dict.get("date", "")
                lead["raw_subject"] = email_dict.get("subject", "")
                lead["lead_index"] = 0
                lead["type"] = "job_lead"
                results = [lead]
            else:
                stats["unresolved"] += 1
                results = [{
                    "type": "unresolved",
                    "reason": "Single-job email but could not extract company/role",
                    "email_uid": uid,
                    "email_date": email_dict.get("date", ""),
                    "raw_subject": email_dict.get("subject", ""),
                }]

        elif email_type == "recruiter_generic":
            stats["recruiter"] += 1
            recruiter_info = parse_recruiter_email(email_dict, alias_map)
            if recruiter_info.get("target_company") and recruiter_info.get("role_hint"):
                stats["leads_found"] += 1
                results = [{
                    "type": "job_lead",
                    "company": recruiter_info["target_company"],
                    "role": recruiter_info["role_hint"],
                    "source_platform": "Recruiter",
                    "confidence": recruiter_info["confidence"],
                    "recruiter_name": recruiter_info["recruiter_name"],
                    "recruiter_company": recruiter_info["recruiter_company"],
                    "is_staffing_agency": recruiter_info["is_staffing_agency"],
                    "email_uid": uid,
                    "email_date": email_dict.get("date", ""),
                    "raw_subject": email_dict.get("subject", ""),
                    "lead_index": 0,
                }]
            else:
                stats["unresolved"] += 1
                results = [{
                    "type": "unresolved",
                    "reason": "Recruiter email without specific company/role",
                    "recruiter_name": recruiter_info.get("recruiter_name", ""),
                    "recruiter_company": recruiter_info.get("recruiter_company", ""),
                    "email_uid": uid,
                    "email_date": email_dict.get("date", ""),
                    "raw_subject": email_dict.get("subject", ""),
                }]

        else:  # unknown
            stats["unresolved"] += 1
            results = [{
                "type": "unresolved",
                "reason": "Could not classify email type",
                "email_uid": uid,
                "email_date": email_dict.get("date", ""),
                "raw_subject": email_dict.get("subject", ""),
            }]

        # Save parsed results
        parsed_path = os.path.join(STAGING_PARSED, filename)
        with open(parsed_path, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        stats["parsed"] += 1

    return stats


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Parse raw emails into job leads")
    parser.add_argument("--reparse", action="store_true", help="Re-parse already processed emails")
    args = parser.parse_args()

    print("=" * 60)
    print("  EMAIL PIPELINE — STEP 2: PARSE")
    print("=" * 60)

    stats = process_raw_emails(reparse=args.reparse)

    print("\n  Results:")
    print(f"    Emails processed: {stats['parsed']} / {stats['total']}")
    print(f"    Single-job emails: {stats.get('single_job', 0)}")
    print(f"    Multi-job emails:  {stats.get('multi_job', 0)}")
    print(f"    Recruiter emails:  {stats.get('recruiter', 0)}")
    print(f"    Not-job emails:    {stats['not_job']}")
    print(f"    Unresolved:        {stats['unresolved']}")
    print(f"    Total leads found: {stats.get('leads_found', 0)}")

    print(f"\n{'=' * 60}")
    print(f"  PARSE COMPLETE — {stats.get('leads_found', 0)} leads ready for career search")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
