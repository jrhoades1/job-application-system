/**
 * Job Description capture — detects job posting pages and extracts
 * the JD from the DOM, then sends it to the API via the background script.
 *
 * Runs on LinkedIn, ZipRecruiter, Indeed, Glassdoor, and generic job pages.
 */

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
      ".job-details-jobs-unified-top-card__job-title",
      ".jobs-unified-top-card__job-title",
      "h1.t-24",
      "h1 a",
      "h1",
    ],
    companySelectors: [
      ".job-details-jobs-unified-top-card__company-name",
      ".jobs-unified-top-card__company-name",
      ".jobs-unified-top-card__subtitle-primary-grouping a",
      "a[data-tracking-control-name*='company']",
      "[class*='company-name']",
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
    // Generic job boards — Greenhouse, Lever, Workday, etc.
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

function extractText(selectors: string[]): string | null {
  // Try explicit selectors first
  for (const selector of selectors) {
    const els = document.querySelectorAll(selector);
    for (const el of els) {
      const text = el.textContent?.trim() ?? "";
      if (text.length > 100) return text;
    }
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
        const content = container.textContent?.trim() ?? "";
        if (content.length > 200) return content;
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

    const text = block.textContent?.trim() ?? "";
    // Only consider blocks with substantial text that aren't the whole page
    if (text.length > 200 && text.length < 20000) {
      candidates.push({ el: block, length: text.length });
    }
  }

  // Sort by length descending, pick the largest that's likely a JD
  candidates.sort((a, b) => b.length - a.length);
  for (const c of candidates) {
    const text = c.el.textContent?.trim() ?? "";
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

/** Parse job title and company from the browser tab title */
function parsePageTitle(pageTitle: string): { title?: string; company?: string } {
  // Strip leading notification count: "(2) Title..." → "Title..."
  const cleaned = pageTitle.replace(/^\(\d+\)\s*/, "");

  // LinkedIn: "Perfecting Peds hiring Director of Engineering in United States | LinkedIn"
  const linkedinMatch = cleaned.match(/^(.+?)\s+hiring\s+(.+?)\s+in\s+/i);
  if (linkedinMatch) {
    return { company: linkedinMatch[1].trim(), title: linkedinMatch[2].trim() };
  }

  // LinkedIn alt: "Director of Engineering - Perfecting Peds | LinkedIn"
  const linkedinAlt = cleaned.match(/^(.+?)\s*[-–—]\s*(.+?)\s*\|\s*LinkedIn/i);
  if (linkedinAlt) {
    return { title: linkedinAlt[1].trim(), company: linkedinAlt[2].trim() };
  }

  // ZipRecruiter: "Role - Company | ZipRecruiter"
  const zipMatch = cleaned.match(/^(.+?)\s*[-–—]\s*(.+?)\s*\|\s*ZipRecruiter/i);
  if (zipMatch) {
    return { title: zipMatch[1].trim(), company: zipMatch[2].trim() };
  }

  // Indeed: "Role - Company - Location | Indeed.com"
  const indeedMatch = cleaned.match(/^(.+?)\s*[-–—]\s*(.+?)\s*[-–—]/i);
  if (indeedMatch) {
    return { title: indeedMatch[1].trim(), company: indeedMatch[2].trim() };
  }

  // Generic: "Role at Company" or "Role | Company"
  const genericMatch = cleaned.match(/^(.+?)\s+(?:at|@|\|)\s+(.+?)(?:\s*[-–—|]|$)/i);
  if (genericMatch) {
    return { title: genericMatch[1].trim(), company: genericMatch[2].trim() };
  }

  return {};
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

  const description = extractText(extractor.selectors);
  if (!description || description.length < 50) {
    return { url, description: "", error: "Could not find job description content on this page" };
  }

  // Clean the description
  const cleaned = description
    .replace(/\s+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 50000);

  let title = extractFirst(extractor.titleSelectors) ?? undefined;
  let company = extractFirst(extractor.companySelectors) ?? undefined;

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

  return { url, description: cleaned, title, company };
}
