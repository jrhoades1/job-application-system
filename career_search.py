"""
Email Pipeline — Step 3: Career Search

For each parsed job lead, finds the actual job posting on the company's
career site and scrapes the full job description. Avoids scraping LinkedIn
or other job boards — goes directly to the source.

Uses Google search to discover career pages, then ATS-specific scrapers
(Workday, Greenhouse, Lever, iCIMS) or a generic scraper for the job
description content.

Usage:
    python career_search.py [--limit N] [--retry-unresolved]
"""

import json
import os
import re
import sys
import time
from datetime import datetime
from urllib.parse import urlparse, quote_plus

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("ERROR: Missing dependencies. Run: pip install requests beautifulsoup4")
    sys.exit(1)

# Paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PIPELINE_DIR = os.path.join(SCRIPT_DIR, "pipeline")
STAGING_PARSED = os.path.join(PIPELINE_DIR, "staging", "parsed")
STAGING_SOURCED = os.path.join(PIPELINE_DIR, "staging", "sourced")
CONFIG_PATH = os.path.join(SCRIPT_DIR, "pipeline_config.json")

# HTTP headers for requests
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def load_config():
    """Load pipeline configuration."""
    if not os.path.exists(CONFIG_PATH):
        return {"ats_handlers": {}, "throttle": {}}
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Career page discovery
# ---------------------------------------------------------------------------

def find_career_page(company, role, config):
    """Search for the specific job posting on the company career site.

    Strategy:
      1. Search for '{company} careers {role}' — prefer specific job URLs
      2. If we land on a general careers page, scan for links to the specific role
      3. Detect ATS type from URL
    Returns {url, ats_type, confidence} or None.
    """
    throttle = config.get("throttle", {})
    delay = throttle.get("google_search_seconds", 2.0)
    ats_handlers = config.get("ats_handlers", {})

    urls = google_search_careers(company, role, delay)
    if not urls:
        return None

    for url in urls:
        ats_type = detect_ats(url, ats_handlers)

        # Check if URL looks like a specific job posting vs general careers page
        if _is_job_listing_url(url):
            return {"url": url, "ats_type": ats_type, "confidence": 0.85}

        # It's a general careers page — scan for the specific role link
        specific_url = _find_job_link_on_page(url, role, company)
        if specific_url:
            ats_type = detect_ats(specific_url, ats_handlers)
            return {"url": specific_url, "ats_type": ats_type, "confidence": 0.8}

        # Use the careers page as fallback
        return {"url": url, "ats_type": ats_type, "confidence": 0.5}

    return None


def _is_job_listing_url(url):
    """Check if URL points to a specific job listing (not a general careers page)."""
    path = urlparse(url).path.lower()
    url_lower = url.lower()
    # Path-only patterns (IDs or specific slugs in the URL path)
    path_patterns = [
        r'/jobs?/\d+',                   # /job/12345 or /jobs/12345
        r'/jobs?/[a-z0-9-]+/\d+',        # /jobs/some-title/12345
        r'/positions?/\d+',
        r'/postings?/\d+',
        r'/[a-z-]+/jobs?/[a-z0-9-]+',    # /company/jobs/role-slug
    ]
    # Full-URL patterns (include domain matching)
    url_patterns = [
        r'greenhouse\.io/[^/]+/jobs/\d+',
        r'lever\.co/[^/]+/[a-f0-9-]+',
        r'ashbyhq\.com/[^/]+/[a-f0-9-]+',
    ]
    return (any(re.search(p, path) for p in path_patterns)
            or any(re.search(p, url_lower) for p in url_patterns))


def _find_job_link_on_page(career_page_url, role, company):
    """Scan a careers page for a link matching the specific role."""
    try:
        resp = requests.get(career_page_url, headers=HEADERS, timeout=15,
                            allow_redirects=True)
        resp.raise_for_status()
    except requests.RequestException:
        return None

    soup = BeautifulSoup(resp.text, "html.parser")

    # Normalize role for matching
    role_lower = role.lower()
    # Key role words to match (ignore common words)
    role_words = set(re.findall(r'\b[a-z]{3,}\b', role_lower))
    role_words -= {'the', 'and', 'for', 'with'}

    best_link = None
    best_score = 0

    for a_tag in soup.find_all("a", href=True):
        link_text = a_tag.get_text(strip=True).lower()
        href = a_tag["href"]

        if not link_text or len(link_text) < 5:
            continue

        # Count how many role words appear in the link text
        link_words = set(re.findall(r'\b[a-z]{3,}\b', link_text))
        overlap = len(role_words & link_words)

        if overlap >= 2 and overlap > best_score:
            best_score = overlap
            # Make absolute URL
            if href.startswith("/"):
                parsed = urlparse(career_page_url)
                href = f"{parsed.scheme}://{parsed.netloc}{href}"
            elif not href.startswith("http"):
                continue
            best_link = href

    return best_link


def google_search_careers(company, role, throttle_seconds=2.0):
    """Search for career page URLs using DuckDuckGo (primary) and direct URL probing.

    Excludes LinkedIn, Indeed, Glassdoor, ZipRecruiter results.
    Returns list of candidate URLs.
    """
    excluded_sites = [
        "linkedin.com", "indeed.com", "glassdoor.com", "ziprecruiter.com",
        "dice.com", "monster.com", "careerbuilder.com", "simplyhired.com",
        "startup.jobs", "employbl.com", "builtin.com",
    ]

    # Strategy 1: Direct URL probing for common career page patterns
    direct_urls = _probe_direct_career_urls(company, excluded_sites)

    # Strategy 2: DuckDuckGo search
    search_urls = _duckduckgo_search(company, role, excluded_sites, throttle_seconds)

    # Combine results (direct probes first, then search)
    all_urls = direct_urls + search_urls

    # Deduplicate while preserving order
    seen = set()
    unique = []
    for url in all_urls:
        if url not in seen:
            seen.add(url)
            unique.append(url)

    return unique[:5]


def _probe_direct_career_urls(company, excluded_domains):
    """Try common career page URL patterns directly."""
    urls = []

    # Normalize company name to domain slug
    slug = re.sub(r'[^a-z0-9]', '', company.lower())
    slug_hyphen = re.sub(r'[^a-z0-9]+', '-', company.lower()).strip('-')

    # Common patterns to probe
    patterns = [
        f"https://www.{slug}.com/careers",
        f"https://www.{slug}.com/jobs",
        f"https://{slug}.com/careers",
        f"https://{slug}.com/company/careers",
        f"https://careers.{slug}.com",
        f"https://boards.greenhouse.io/{slug}",
        f"https://jobs.lever.co/{slug}",
        f"https://jobs.ashbyhq.com/{slug}",
        f"https://jobs.smartrecruiters.com/{slug_hyphen}",
    ]

    for url in patterns:
        try:
            resp = requests.head(url, headers=HEADERS, timeout=8,
                                 allow_redirects=True)
            if resp.status_code == 200:
                final_url = resp.url
                if _is_career_url(final_url, excluded_domains):
                    urls.append(final_url)
                    break  # Found a valid career page, stop probing
        except requests.RequestException:
            continue

    return urls


def _duckduckgo_search(company, role, excluded_domains, throttle_seconds=2.0):
    """Search DuckDuckGo HTML for career page URLs."""
    query = f'{company} careers {role}'
    search_url = f"https://html.duckduckgo.com/html/?q={quote_plus(query)}"

    time.sleep(throttle_seconds)

    try:
        resp = requests.get(search_url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"      WARNING: Search failed for '{company}': {e}")
        return []

    soup = BeautifulSoup(resp.text, "html.parser")
    urls = []

    # DuckDuckGo HTML results use class="result__a" links
    for a_tag in soup.find_all("a", class_="result__a"):
        href = a_tag.get("href", "")

        # DuckDuckGo redirect format: //duckduckgo.com/l/?uddg=<encoded_url>&...
        uddg_match = re.search(r'uddg=([^&]+)', href)
        if uddg_match:
            from urllib.parse import unquote
            url = unquote(uddg_match.group(1))
        elif href.startswith("http"):
            url = href
        else:
            continue

        if _is_career_url(url, excluded_domains):
            urls.append(url)

    return urls[:5]


def _is_career_url(url, excluded_domains):
    """Check if URL is likely a career page (not a job board)."""
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
    except Exception:
        return False

    # Exclude job board domains
    for exc in excluded_domains:
        if exc in domain:
            return False

    # Exclude Google's own domains
    if "google." in domain:
        return False

    # Prefer URLs with career-related paths
    path = parsed.path.lower()
    career_indicators = [
        "/careers", "/jobs", "/job/", "/career", "/openings",
        "/positions", "/opportunities", "/apply", "/hiring",
        "greenhouse.io", "lever.co", "myworkdayjobs.com",
        "icims.com", "smartrecruiters.com", "ashbyhq.com",
        "bamboohr.com",
    ]

    # ATS domains are always career URLs
    for ind in career_indicators:
        if ind in domain or ind in path:
            return True

    # Generic URLs might still be career pages
    return True


# ---------------------------------------------------------------------------
# ATS detection
# ---------------------------------------------------------------------------

def detect_ats(url, ats_handlers=None):
    """Detect which ATS system hosts the career page.

    Returns ATS name string or None.
    """
    if not ats_handlers:
        ats_handlers = {}

    url_lower = url.lower()

    # Check configured ATS handlers
    for ats_name, handler in ats_handlers.items():
        for pattern in handler.get("url_patterns", []):
            if pattern.lower() in url_lower:
                return ats_name

    # Fallback built-in detection
    builtin = {
        "workday": ["myworkdayjobs.com", "wd1.myworkdayjobs", "wd5.myworkdayjobs"],
        "greenhouse": ["boards.greenhouse.io", "job-boards.greenhouse.io"],
        "lever": ["jobs.lever.co"],
        "icims": ["icims.com"],
        "successfactors": ["successfactors.com"],
        "smartrecruiters": ["jobs.smartrecruiters.com"],
        "ashby": ["jobs.ashbyhq.com"],
        "bamboohr": ["bamboohr.com/careers", "bamboohr.com/jobs"],
        "jobvite": ["jobs.jobvite.com"],
    }

    for ats_name, patterns in builtin.items():
        for pattern in patterns:
            if pattern in url_lower:
                return ats_name

    return None


# ---------------------------------------------------------------------------
# Job description scrapers
# ---------------------------------------------------------------------------

def scrape_job_description(url, ats_type, config):
    """Scrape the actual job description from the career page.

    Routes to ATS-specific or generic scraper based on ats_type.
    Returns dict with title, company, location, description, etc.
    """
    ats_handlers = config.get("ats_handlers", {})
    handler = ats_handlers.get(ats_type, {})

    # If ATS requires Playwright, try it; fall back to requests
    if handler.get("requires_playwright") and ats_type in ("workday", "icims", "successfactors"):
        result = _scrape_with_playwright(url, ats_type)
        if result:
            return result

    # Use requests + BeautifulSoup
    if ats_type == "greenhouse":
        return scrape_greenhouse(url)
    elif ats_type == "lever":
        return scrape_lever(url)
    elif ats_type == "smartrecruiters":
        return scrape_generic(url)
    elif ats_type == "ashby":
        return scrape_generic(url)
    else:
        return scrape_generic(url)


def scrape_greenhouse(url):
    """ATS-specific scraper for Greenhouse.

    boards.greenhouse.io pages are mostly static HTML with predictable structure.
    """
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
    except requests.RequestException as e:
        return {"error": str(e), "url": url}

    soup = BeautifulSoup(resp.text, "html.parser")

    # Greenhouse structure: .app-title for role, .company-name, #content for description
    title = ""
    title_el = soup.select_one(".app-title, h1.heading")
    if title_el:
        title = title_el.get_text(strip=True)

    company = ""
    company_el = soup.select_one(".company-name, .company")
    if company_el:
        company = company_el.get_text(strip=True)

    location = ""
    location_el = soup.select_one(".location, .body--metadata")
    if location_el:
        location = location_el.get_text(strip=True)

    description = ""
    content_el = soup.select_one("#content, .content, .job-post-content")
    if content_el:
        description = content_el.get_text(separator="\n", strip=True)

    return _build_scrape_result(url, "greenhouse", title, company, location, description, resp.text)


def scrape_lever(url):
    """ATS-specific scraper for Lever.

    jobs.lever.co pages are semi-static with a known structure.
    """
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
    except requests.RequestException as e:
        return {"error": str(e), "url": url}

    soup = BeautifulSoup(resp.text, "html.parser")

    title = ""
    title_el = soup.select_one(".posting-headline h2, h1")
    if title_el:
        title = title_el.get_text(strip=True)

    company = ""
    # Lever usually has company in the page title or header
    header_el = soup.select_one(".main-header-logo, .posting-headline .company")
    if header_el:
        company = header_el.get_text(strip=True)

    location = ""
    location_el = soup.select_one(".posting-categories .location, .workplaceTypes")
    if location_el:
        location = location_el.get_text(strip=True)

    description = ""
    content_sections = soup.select(".posting-page .section-wrapper, .posting-page .content")
    if content_sections:
        description = "\n\n".join(s.get_text(separator="\n", strip=True) for s in content_sections)
    else:
        content_el = soup.select_one(".content, .posting-page")
        if content_el:
            description = content_el.get_text(separator="\n", strip=True)

    return _build_scrape_result(url, "lever", title, company, location, description, resp.text)


def scrape_generic(url):
    """Generic scraper for unknown career page formats.

    Extracts the largest meaningful text block, looks for common
    section headers (Requirements, Qualifications, Responsibilities).
    """
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15, allow_redirects=True)
        resp.raise_for_status()
    except requests.RequestException as e:
        return {"error": str(e), "url": url}

    soup = BeautifulSoup(resp.text, "html.parser")

    # Remove script, style, nav, footer elements
    for tag in soup.select("script, style, nav, footer, header, .cookie-banner"):
        tag.decompose()

    # Try to find the job title from h1 or og:title
    title = ""
    h1 = soup.find("h1")
    if h1:
        title = h1.get_text(strip=True)
    if not title:
        og_title = soup.find("meta", property="og:title")
        if og_title:
            title = og_title.get("content", "")

    # Try og:site_name for company
    company = ""
    og_site = soup.find("meta", property="og:site_name")
    if og_site:
        company = og_site.get("content", "")

    # Try to find location
    location = ""
    for el in soup.select("[class*='location'], [data-automation*='location']"):
        location = el.get_text(strip=True)
        break

    # Find the main content area
    description = ""

    # Strategy 1: Look for elements with job-related classes
    job_selectors = [
        "[class*='job-description']", "[class*='job-detail']",
        "[class*='posting-detail']", "[class*='jd-']",
        "[id*='job-description']", "[id*='job-detail']",
        "article", "main", "[role='main']",
    ]
    for selector in job_selectors:
        el = soup.select_one(selector)
        if el:
            text = el.get_text(separator="\n", strip=True)
            if len(text) > 200:  # Minimum meaningful content
                description = text
                break

    # Strategy 2: Find sections by headers
    if not description:
        sections = []
        job_headers = [
            "description", "responsibilities", "requirements",
            "qualifications", "about the role", "what you'll do",
            "who you are", "about you", "skills", "experience",
        ]
        for header in soup.find_all(["h1", "h2", "h3", "h4", "strong", "b"]):
            header_text = header.get_text(strip=True).lower()
            if any(jh in header_text for jh in job_headers):
                # Get text until next header
                content_parts = []
                sibling = header.find_next_sibling()
                while sibling and sibling.name not in ("h1", "h2", "h3", "h4"):
                    content_parts.append(sibling.get_text(separator="\n", strip=True))
                    sibling = sibling.find_next_sibling()
                sections.append(f"{header.get_text(strip=True)}\n" + "\n".join(content_parts))

        if sections:
            description = "\n\n".join(sections)

    # Strategy 3: Largest text block
    if not description:
        body = soup.find("body")
        if body:
            description = body.get_text(separator="\n", strip=True)
            # Trim to reasonable length
            if len(description) > 10000:
                description = description[:10000]

    return _build_scrape_result(url, None, title, company, location, description, resp.text)


def _scrape_with_playwright(url, ats_type):
    """Scrape a JS-heavy page using Playwright.

    Falls back to None if Playwright is not available.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print(f"    WARNING: Playwright not available for {ats_type}. Using generic scraper.")
        return scrape_generic(url)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.set_extra_http_headers({"User-Agent": HEADERS["User-Agent"]})

            page.goto(url, wait_until="domcontentloaded", timeout=30000)
            # Wait for content to render
            page.wait_for_timeout(3000)

            # Extract content
            title = page.evaluate("""
                () => {
                    const h1 = document.querySelector('h1');
                    return h1 ? h1.textContent.trim() : '';
                }
            """)

            description = page.evaluate("""
                () => {
                    // Try common job description selectors
                    const selectors = [
                        '[data-automation-id="jobPostingDescription"]',
                        '[class*="job-description"]',
                        '[class*="jobDescription"]',
                        'article', 'main', '[role="main"]'
                    ];
                    for (const sel of selectors) {
                        const el = document.querySelector(sel);
                        if (el && el.textContent.trim().length > 200) {
                            return el.textContent.trim();
                        }
                    }
                    return document.body ? document.body.textContent.trim().substring(0, 10000) : '';
                }
            """)

            location = page.evaluate("""
                () => {
                    const el = document.querySelector('[class*="location"], [data-automation*="location"]');
                    return el ? el.textContent.trim() : '';
                }
            """)

            html = page.content()
            browser.close()

            return _build_scrape_result(url, ats_type, title, "", location, description, html)

    except Exception as e:
        print(f"    WARNING: Playwright scrape failed for {url}: {e}")
        return scrape_generic(url)


def _build_scrape_result(url, ats_type, title, company, location, description, raw_html):
    """Build a standardized scrape result dict."""
    # Extract compensation if mentioned
    compensation = _extract_compensation(description)

    # Check description completeness
    description_incomplete = len(description) < 200 if description else True

    return {
        "url": url,
        "ats_type": ats_type,
        "title": title,
        "company": company,
        "location": location,
        "description_text": description,
        "compensation": compensation,
        "description_incomplete": description_incomplete,
        "scraped_at": datetime.now().isoformat(),
    }


def _extract_compensation(text):
    """Extract salary/compensation from job description text."""
    if not text:
        return None

    # Common salary patterns
    patterns = [
        r'\$[\d,]+(?:k|K)?\s*[-–to]+\s*\$[\d,]+(?:k|K)?',  # $120K - $180K
        r'\$[\d,]+\s*[-–to]+\s*\$[\d,]+',                     # $120,000 - $180,000
        r'(?:salary|compensation|pay)[\s:]+\$[\d,kK]+',        # Salary: $150K
        r'\$\d{2,3}(?:,\d{3})*(?:\s*[-–]\s*\$\d{2,3}(?:,\d{3})*)?', # $120,000 or $120,000-$180,000
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(0).strip()

    return None


# ---------------------------------------------------------------------------
# Fuzzy matching
# ---------------------------------------------------------------------------

def validate_job_match(parsed_lead, scraped_job):
    """Verify the scraped job matches the email lead.

    Uses fuzzy string matching on company name and role title.
    Returns {is_match, confidence, title_similarity, company_similarity}.
    """
    try:
        from thefuzz import fuzz
    except ImportError:
        # Fallback to simple comparison
        return _simple_match(parsed_lead, scraped_job)

    lead_role = (parsed_lead.get("role") or "").lower().strip()
    lead_company = (parsed_lead.get("company") or "").lower().strip()
    scraped_role = (scraped_job.get("title") or "").lower().strip()
    scraped_company = (scraped_job.get("company") or "").lower().strip()

    title_sim = fuzz.token_sort_ratio(lead_role, scraped_role) / 100.0 if lead_role and scraped_role else 0.0
    company_sim = fuzz.token_sort_ratio(lead_company, scraped_company) / 100.0 if lead_company and scraped_company else 0.0

    # If company from scrape is empty (common), use URL-based matching
    if not scraped_company:
        url = scraped_job.get("url", "")
        domain = urlparse(url).netloc.lower().replace("www.", "")
        company_slug = lead_company.replace(" ", "").replace(",", "").replace(".", "")
        if company_slug in domain:
            company_sim = 0.8

    # Overall confidence
    if title_sim >= 0.6 or company_sim >= 0.7:
        is_match = True
        confidence = (title_sim * 0.6 + company_sim * 0.4)
    else:
        is_match = title_sim >= 0.4  # Lenient — role titles vary a lot
        confidence = (title_sim * 0.6 + company_sim * 0.4)

    return {
        "is_match": is_match,
        "confidence": round(confidence, 2),
        "title_similarity": round(title_sim, 2),
        "company_similarity": round(company_sim, 2),
    }


def _simple_match(parsed_lead, scraped_job):
    """Simple string-based matching when thefuzz is not available."""
    lead_role = (parsed_lead.get("role") or "").lower()
    scraped_role = (scraped_job.get("title") or "").lower()

    # Check if key words overlap
    lead_words = set(lead_role.split())
    scraped_words = set(scraped_role.split())

    if lead_words and scraped_words:
        overlap = len(lead_words & scraped_words) / max(len(lead_words), len(scraped_words))
    else:
        overlap = 0.0

    return {
        "is_match": overlap >= 0.4,
        "confidence": round(overlap, 2),
        "title_similarity": round(overlap, 2),
        "company_similarity": 0.5,  # Can't reliably check without fuzzy
    }


def find_similar_roles(company, career_page_url):
    """When exact role not found, look for similar roles at same company.

    Returns list of {title, url, similarity_score}.
    """
    # This is a best-effort scrape of the company's career page listing
    try:
        resp = requests.get(career_page_url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
    except requests.RequestException:
        return []

    soup = BeautifulSoup(resp.text, "html.parser")

    # Look for job listing links
    roles = []
    for a_tag in soup.find_all("a", href=True):
        text = a_tag.get_text(strip=True)
        href = a_tag["href"]

        # Filter to likely job links
        if len(text) > 5 and len(text) < 100:
            path = urlparse(href).path.lower()
            if any(kw in path for kw in ["/job/", "/position/", "/opening/", "/careers/"]):
                roles.append({"title": text, "url": href})

    return roles[:10]


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def process_parsed_leads(config, limit=None, retry_unresolved=False):
    """Process all parsed lead files and search for career pages."""
    os.makedirs(STAGING_SOURCED, exist_ok=True)

    # Gather all leads from parsed files
    if not os.path.exists(STAGING_PARSED):
        print("  No parsed leads found.")
        return {"total": 0, "sourced": 0, "unresolved": 0}

    parsed_files = [f for f in os.listdir(STAGING_PARSED) if f.endswith(".json")]
    if not parsed_files:
        print("  No parsed lead files found.")
        return {"total": 0, "sourced": 0, "unresolved": 0}

    # Load all leads
    all_leads = []
    for filename in sorted(parsed_files):
        filepath = os.path.join(STAGING_PARSED, filename)
        with open(filepath, encoding="utf-8") as f:
            results = json.load(f)

        for result in results:
            if result.get("type") == "job_lead":
                result["_source_file"] = filename
                all_leads.append(result)

    if not all_leads:
        print("  No job leads to search for.")
        return {"total": 0, "sourced": 0, "unresolved": 0}

    # Check which are already sourced
    sourced_keys = set()
    if not retry_unresolved:
        for f in os.listdir(STAGING_SOURCED) if os.path.exists(STAGING_SOURCED) else []:
            if f.endswith(".json"):
                sourced_keys.add(f)

    # Filter to unprocessed leads
    leads_to_process = []
    for lead in all_leads:
        key = f"{lead['email_uid']}_{lead.get('lead_index', 0)}.json"
        if key not in sourced_keys:
            leads_to_process.append(lead)

    if limit:
        leads_to_process = leads_to_process[:limit]

    if not leads_to_process:
        print("  All leads already sourced.")
        return {"total": len(all_leads), "sourced": 0, "unresolved": 0, "already_sourced": len(sourced_keys)}

    print(f"  Searching career pages for {len(leads_to_process)} leads...")

    throttle = config.get("throttle", {})
    career_delay = throttle.get("career_page_seconds", 1.0)

    stats = {"total": len(leads_to_process), "sourced": 0, "unresolved": 0, "skipped": 0}

    for i, lead in enumerate(leads_to_process):
        company = lead.get("company", "Unknown")
        role = lead.get("role", "Unknown")
        print(f"\n    [{i+1}/{len(leads_to_process)}] {company} — {role}")

        # Find career page
        career_result = find_career_page(company, role, config)

        if not career_result:
            print("      No career page found")
            stats["unresolved"] += 1
            _save_sourced_result(lead, None, "No career page found for company")
            continue

        url = career_result["url"]
        ats_type = career_result["ats_type"]
        print(f"      Found: {url[:80]}... (ATS: {ats_type or 'generic'})")

        # Scrape the job description
        time.sleep(career_delay)
        scraped = scrape_job_description(url, ats_type, config)

        if scraped.get("error"):
            print(f"      Scrape failed: {scraped['error']}")
            stats["unresolved"] += 1
            _save_sourced_result(lead, scraped, f"Scrape failed: {scraped['error']}")
            continue

        if not scraped.get("description_text"):
            print("      No description content found")
            stats["unresolved"] += 1
            _save_sourced_result(lead, scraped, "No description content on page")
            continue

        # Validate match
        match_result = validate_job_match(lead, scraped)
        if not match_result["is_match"]:
            print(f"      WARNING: Low match confidence ({match_result['confidence']:.2f})")

        # Save sourced result
        sourced_data = {
            "lead": lead,
            "scraped": scraped,
            "match_validation": match_result,
            "career_page": career_result,
            "status": "sourced",
            "sourced_at": datetime.now().isoformat(),
        }

        key = f"{lead['email_uid']}_{lead.get('lead_index', 0)}.json"
        filepath = os.path.join(STAGING_SOURCED, key)
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(sourced_data, f, indent=2, ensure_ascii=False)

        stats["sourced"] += 1
        desc_len = len(scraped.get("description_text", ""))
        print(f"      Sourced: {desc_len} chars, match confidence: {match_result['confidence']:.2f}")

    return stats


def _save_sourced_result(lead, scraped, error_reason):
    """Save an unresolved sourced result."""
    os.makedirs(STAGING_SOURCED, exist_ok=True)
    sourced_data = {
        "lead": lead,
        "scraped": scraped,
        "match_validation": None,
        "career_page": None,
        "status": "unresolved",
        "unresolved_reason": error_reason,
        "sourced_at": datetime.now().isoformat(),
    }

    key = f"{lead['email_uid']}_{lead.get('lead_index', 0)}.json"
    filepath = os.path.join(STAGING_SOURCED, key)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(sourced_data, f, indent=2, ensure_ascii=False)


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Search company career pages for job postings")
    parser.add_argument("--limit", type=int, default=None, help="Max leads to process")
    parser.add_argument("--retry-unresolved", action="store_true", help="Retry previously unresolved leads")
    args = parser.parse_args()

    print("=" * 60)
    print("  EMAIL PIPELINE — STEP 3: CAREER SEARCH")
    print("=" * 60)

    config = load_config()
    stats = process_parsed_leads(config, limit=args.limit, retry_unresolved=args.retry_unresolved)

    print("\n  Results:")
    print(f"    Leads processed: {stats['total']}")
    print(f"    Sourced:         {stats['sourced']}")
    print(f"    Unresolved:      {stats['unresolved']}")
    if stats.get("already_sourced"):
        print(f"    Already sourced: {stats['already_sourced']}")

    print(f"\n{'=' * 60}")
    print(f"  CAREER SEARCH COMPLETE — {stats['sourced']} descriptions ready for scoring")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
