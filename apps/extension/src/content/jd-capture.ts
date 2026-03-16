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
      "[class*='description']",
    ],
    titleSelectors: [
      ".job-details-jobs-unified-top-card__job-title",
      ".jobs-unified-top-card__job-title",
      "h1.t-24",
      "h1",
    ],
    companySelectors: [
      ".job-details-jobs-unified-top-card__company-name",
      ".jobs-unified-top-card__company-name",
      ".jobs-unified-top-card__subtitle-primary-grouping a",
      "a[data-tracking-control-name*='company']",
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
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) {
      const text = el.textContent?.trim() ?? "";
      if (text.length > 20) return text;
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

// Track URLs we've already captured to avoid duplicate sends
const capturedUrls = new Set<string>();

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

function showCaptureToast(message: string, type: "success" | "info"): void {
  const colors = { success: "#22c55e", info: "#3b82f6" };
  const toast = document.createElement("div");
  toast.style.cssText = `
    position: fixed;
    bottom: 70px;
    right: 20px;
    z-index: 9999999;
    background: ${colors[type]};
    color: white;
    padding: 8px 14px;
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 12px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    transition: opacity 0.3s;
    max-width: 300px;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
