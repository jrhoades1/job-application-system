/**
 * Job Description capture — detects job posting pages and extracts
 * the JD from the DOM, then sends it to the API via the background script.
 *
 * Runs on LinkedIn, ZipRecruiter, Indeed, Glassdoor, and generic job pages.
 */

import { parsePageTitle } from "@/lib/parse-page-title";
import { parseJobPostingJsonLd } from "@/lib/parse-job-posting";

/** Selectors for extracting job descriptions from known platforms */
const JD_EXTRACTORS: {
  pattern: RegExp;
  selectors: string[];
  titleSelectors: string[];
  companySelectors: string[];
}[] = [
  {
    // LinkedIn job pages (view, search results with panel, collections)
    pattern: /linkedin\.com\/jobs\//i,
    selectors: [
      ".show-more-less-html__markup",
      ".description__text",
      ".jobs-description__content",
      ".jobs-box__html-content",
      "#job-details",
      "[class*='jobs-description']",
      "[class*='job-details'] [class*='description']",
      "article [class*='description']",
      // Fallback: find the "About the job" section and grab content after it
      ".jobs-description",
    ],
    titleSelectors: [
      // Panel view (search results with right-hand JD panel)
      ".job-details-jobs-unified-top-card__job-title h1",
      ".job-details-jobs-unified-top-card__job-title a",
      ".job-details-jobs-unified-top-card__job-title",
      ".jobs-details__main-content h1",
      ".jobs-details__main-content .t-24",
      ".scaffold-layout__detail h1",
      // Legacy / full-page layout
      ".jobs-unified-top-card__job-title",
      "h1.t-24",
      "[class*='top-card'] h1",
      "[class*='job-title']",
      "h1 a",
      // Modern LinkedIn variants where role is rendered as h2 / role=heading
      // ("Promoted by hirer" / off-LinkedIn-apply listings sometimes drop h1
      // entirely — Geron VP IT 4396151962 was the regression that surfaced this).
      "h2[class*='job-title']",
      "h2[class*='topcard']",
      "[role='heading'][class*='title']",
      "[data-test*='job-title']",
    ],
    companySelectors: [
      ".job-details-jobs-unified-top-card__company-name a",
      ".job-details-jobs-unified-top-card__company-name",
      ".jobs-unified-top-card__company-name",
      ".jobs-unified-top-card__subtitle-primary-grouping a",
      "a[data-tracking-control-name*='company']",
      "[class*='top-card'] [class*='company']",
      "[class*='company-name']",
      // Modern LinkedIn variants (degraded view dropped the top-card classes)
      "[class*='topcard'] [class*='company']",
      "[data-test*='company']",
      "a[href*='/company/']",
    ],
  },
  {
    // ZipRecruiter job pages
    pattern: /ziprecruiter\.com\/(jobs|c)/i,
    selectors: [
      ".job_description",
      "#job-description",
      "[class*='jobDescriptionSection']",
      ".job-body",
      "[data-testid='job-description']",
    ],
    titleSelectors: [
      "h1.job_title",
      "h1[class*='title']",
      "h1",
    ],
    companySelectors: [
      "a.company_name",
      "[class*='companyName']",
      "a[data-testid='company-name']",
    ],
  },
  {
    // Indeed job pages
    pattern: /indeed\.com\/(viewjob|jobs|rc\/clk)/i,
    selectors: [
      "#jobDescriptionText",
      ".jobsearch-jobDescriptionText",
      "[id*='jobDescription']",
    ],
    titleSelectors: [
      ".jobsearch-JobInfoHeader-title",
      "h1[class*='title']",
      "h1",
    ],
    companySelectors: [
      "[data-company-name]",
      ".jobsearch-InlineCompanyRating a",
      "div[class*='companyName'] a",
    ],
  },
  {
    // Glassdoor job pages
    pattern: /glassdoor\.com\/(job-listing|Job)/i,
    selectors: [
      ".desc",
      "[class*='JobDescription']",
      "#JobDescriptionContainer",
    ],
    titleSelectors: [
      "[class*='JobTitle']",
      "h1",
    ],
    companySelectors: [
      "[class*='EmployerName']",
      "[data-test='employer-name']",
    ],
  },
  {
    // Radancy / TalentBrew (Magic Bullet) career sites -- UHG/Optum and
    // others. The company-hosted hostname varies (careers.unitedhealthgroup.com,
    // jobs.humana.com, etc.) but the path shape /job/<city>/<slug>/<siteId>/<jobId>
    // is consistent across tenants. Class names like `ajd_job-details` and
    // `ats-description` are Radancy-specific.
    //
    // Note: these pages render TWO elements with the same class -- one is the
    // metadata header (~180 chars), the other the actual JD body (~8k chars).
    // The longest-match logic in extractText picks the right one.
    pattern: /\/job\/[^/]+\/[^/]+\/\d+\/\d+(?:[/?#]|$)/i,
    selectors: [
      ".ajd_job-details__ats-description",
      ".ats-description",
      "#anchor-responsibilities",
      "section.ajd_job-details.job-description",
      "[class*='ajd_job-details']",
    ],
    titleSelectors: [
      ".ajd_job-title",
      "[class*='ajd_job-title']",
      "h1",
    ],
    companySelectors: [
      "[class*='ajd_company']",
      "[class*='company-name']",
      "meta[property='og:site_name']",
    ],
  },
  {
    // Workday job detail pages (myworkdayjobs.com or myworkdaysite.com)
    pattern: /myworkday(?:jobs|site)\.com/i,
    selectors: [
      "[data-automation-id='jobPostingDescription']",
      "[data-automation-id='job-posting-description']",
      ".css-cygeeu", // common Workday JD container class
      "[data-automation-id='jobPostingPage'] [class*='richText']",
      "[data-automation-id='jobPostingPage'] [class*='description']",
      "[class*='jobDescription']",
      "[class*='job-description']",
    ],
    titleSelectors: [
      "[data-automation-id='jobPostingHeader'] h2",
      "[data-automation-id='jobPostingHeader']",
      "h2[class*='title']",
      "h1",
    ],
    companySelectors: [
      "[data-automation-id='jobPostingCompany']",
      "[class*='company']",
    ],
  },
  {
    // Generic job boards — Greenhouse, Lever, etc.
    pattern: /\/(jobs?|careers?|positions?|openings?|apply)\//i,
    selectors: [
      "#content .content-intro + div",
      ".content",
      ".job-description",
      "[class*='description']",
      "[class*='jobDescription']",
      "article",
      "main",
    ],
    titleSelectors: [
      "h1",
      "[class*='title']",
    ],
    companySelectors: [
      "[class*='company']",
      "[class*='employer']",
    ],
  },
];

/** Pages we should never try to capture JDs from */
const SKIP_PATTERNS = [
  /\/(login|signin|signup|register|auth|account|settings|profile|feed)\b/i,
  /\/(apply|application)\//i, // Application form pages, not job postings
  /mail\.google\.com/i,
  /github\.com/i,
  /stackoverflow\.com/i,
];

function shouldSkip(url: string): boolean {
  return SKIP_PATTERNS.some((p) => p.test(url));
}

/** Get clean text from an element, stripping script/style/svg noise */
function cleanTextContent(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  for (const tag of clone.querySelectorAll("script, style, svg, noscript")) {
    tag.remove();
  }
  return clone.textContent?.trim() ?? "";
}

/** Detect if text looks like code/markup rather than a real JD */
function looksLikeCode(text: string): boolean {
  const codePatterns = [
    /function\s*\(/g,
    /\bvar\s+\w/g,
    /=>\s*\{/g,
    /\bconst\s+\w/g,
    /\bwindow\.\w/g,
    /document\.(?:get|query|create)/g,
    /\}\s*\)\s*;/g,
  ];
  let hits = 0;
  for (const p of codePatterns) {
    const matches = text.match(p);
    if (matches) hits += matches.length;
  }
  // If code patterns appear frequently relative to text length, it's code
  return hits > 5 && hits / (text.length / 1000) > 2;
}

function extractText(selectors: string[]): string | null {
  // Try explicit selectors first. When a selector matches multiple elements,
  // prefer the longest text -- several ATS templates (Radancy, some Workday
  // tenants) render a short metadata header with the SAME class as the full
  // JD body, and "first match wins" picked up the header (~180 chars) instead
  // of the body (~8k chars). Longest-match keeps the signal.
  for (const selector of selectors) {
    const els = document.querySelectorAll(selector);
    let best: string | null = null;
    let bestLen = 0;
    for (const el of els) {
      const text = cleanTextContent(el);
      if (text.length > 100 && !looksLikeCode(text) && text.length > bestLen) {
        best = text;
        bestLen = text.length;
      }
    }
    if (best) return best;
  }

  // Fallback 1: find "About the job" or "Description" heading and walk DOM
  const allElements = document.querySelectorAll("*");
  for (const el of allElements) {
    const text = el.textContent?.trim().toLowerCase() ?? "";
    if (
      el.children.length === 0 &&
      (text === "about the job" || text === "job description" || text === "description")
    ) {
      // Walk up to find a meaningful container, then grab everything after
      let container = el.parentElement;
      for (let i = 0; i < 5 && container; i++) {
        const content = cleanTextContent(container);
        if (content.length > 200 && !looksLikeCode(content)) return content;
        container = container.parentElement;
      }
    }
  }

  // Fallback 2: find the largest text block on the page (likely the JD)
  const candidates: { el: Element; length: number }[] = [];
  const blocks = document.querySelectorAll("div, section, article, main");
  for (const block of blocks) {
    // Skip nav, header, sidebar, footer
    const tag = block.tagName.toLowerCase();
    const role = block.getAttribute("role") ?? "";
    if (["nav", "header", "footer"].includes(tag)) continue;
    if (["navigation", "banner", "complementary"].includes(role)) continue;

    const text = cleanTextContent(block);
    // Only consider blocks with substantial text that aren't the whole page
    if (text.length > 200 && text.length < 20000 && !looksLikeCode(text)) {
      candidates.push({ el: block, length: text.length });
    }
  }

  // Sort by length descending, pick the largest that's likely a JD
  candidates.sort((a, b) => b.length - a.length);
  for (const c of candidates) {
    const text = cleanTextContent(c.el);
    // Check if it looks like a job description (has JD-like keywords)
    const lower = text.toLowerCase();
    if (
      lower.includes("responsibilit") ||
      lower.includes("qualificat") ||
      lower.includes("requirement") ||
      lower.includes("experience") ||
      lower.includes("about the") ||
      lower.includes("we are looking") ||
      lower.includes("you will") ||
      lower.includes("role")
    ) {
      return text;
    }
  }

  return null;
}

function extractFirst(selectors: string[]): string | null {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) {
      const text = el.textContent?.trim() ?? "";
      if (text.length > 1 && text.length < 200) return text;
    }
  }
  return null;
}

export interface CaptureResult {
  url: string;
  description: string;
  title?: string;
  company?: string;
  error?: string;
}

/**
 * Extract JD from the current page. Returns the data for the background
 * script to send to the API. Called when user clicks "Capture JD" in popup.
 */
export function attemptJDCapture(): CaptureResult {
  const url = window.location.href;

  if (shouldSkip(url)) {
    return { url, description: "", error: "This page type is not supported for JD capture" };
  }

  const extractor = JD_EXTRACTORS.find((e) => e.pattern.test(url));
  if (!extractor) {
    return { url, description: "", error: "Not a recognized job posting page" };
  }

  // Highest-priority source: schema.org JobPosting JSON-LD. When present,
  // it survives DOM/CSS class churn and gives canonical title + company +
  // description. LinkedIn sometimes ships it, sometimes doesn't (depends on
  // page state / hydration), so this is best-effort.
  const ldScripts = [...document.querySelectorAll('script[type="application/ld+json"]')]
    .map((s) => s.textContent ?? "")
    .filter(Boolean);
  const ld = parseJobPostingJsonLd(ldScripts);

  const domDescription = extractText(extractor.selectors);
  const description = domDescription || ld.description || null;
  if (!description || description.length < 50) {
    return { url, description: "", error: "Could not find job description content on this page" };
  }

  // Clean the description
  const cleaned = description
    .replace(/\s+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 50000);

  // JSON-LD wins when present — it's the canonical source.
  let title = ld.title ?? extractFirst(extractor.titleSelectors) ?? undefined;
  let company = ld.company ?? extractFirst(extractor.companySelectors) ?? undefined;

  // Fallback: extract from page title (most reliable on LinkedIn)
  const pageTitle = document.title;
  const parsed = parsePageTitle(pageTitle);
  if (!title && parsed.title) title = parsed.title;
  if (!company && parsed.company) company = parsed.company;

  // Fallback: try og:title meta tag
  if (!title || !company) {
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute("content") ?? "";
    if (ogTitle) {
      const ogParsed = parsePageTitle(ogTitle);
      if (!title && ogParsed.title) title = ogParsed.title;
      if (!company && ogParsed.company) company = ogParsed.company;
    }
  }

  // Fallback: find h1 elements (skip generic ones)
  if (!title) {
    const h1s = document.querySelectorAll("h1, h2");
    for (const h of h1s) {
      const text = h.textContent?.trim() ?? "";
      if (text.length > 3 && text.length < 150 && !/jobs?\s+(based|search|results|alert)/i.test(text)) {
        title = text;
        break;
      }
    }
  }

  // Degraded LinkedIn pages render with title="| Company | LinkedIn", no h1,
  // no top-card classes, no JSON-LD. We can recover company from the page
  // title but the role is genuinely missing from the DOM. Surface a clear
  // error rather than the generic "Could not detect company or role" so the
  // user knows to refresh instead of staring at a useless message. (Regression
  // case: Geron Corp VP IT 4396151962, 2026-04-29.)
  if (parsed.degraded && !title) {
    return {
      url,
      description: cleaned,
      title,
      company,
      error: "LinkedIn page didn't fully load — refresh the tab and try again.",
    };
  }

  return { url, description: cleaned, title, company };
}
