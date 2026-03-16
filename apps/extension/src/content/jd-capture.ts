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
    const el = document.querySelector(selector);
    if (el) {
      const text = el.textContent?.trim() ?? "";
      if (text.length > 50) return text;
    }
  }

  // Fallback: find "About the job" or "Job description" heading and grab sibling/parent content
  const headings = document.querySelectorAll("h2, h3, h4, [role='heading']");
  for (const h of headings) {
    const text = h.textContent?.toLowerCase() ?? "";
    if (text.includes("about the job") || text.includes("job description") || text.includes("description")) {
      // Try next sibling, parent's next sibling, or parent container
      const container = h.closest("section") ?? h.closest("div") ?? h.parentElement;
      if (container) {
        const content = container.textContent?.trim() ?? "";
        if (content.length > 100) return content;
      }
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

  const title = extractFirst(extractor.titleSelectors) ?? undefined;
  const company = extractFirst(extractor.companySelectors) ?? undefined;

  return { url, description: cleaned, title, company };
}
