import type { CheerioAPI } from "cheerio";

// Common job board selectors for job description content
export const JD_SELECTORS = [
  ".show-more-less-html__markup",
  ".description__text",
  "#jobDescriptionText",
  ".jobsearch-jobDescriptionText",
  "#content .content-intro",
  "#content",
  ".section-wrapper .content",
  ".posting-categories",
  '[data-automation-id="jobPostingDescription"]',
  '[class*="job-description"]',
  '[class*="jobDescription"]',
  '[class*="job_description"]',
  '[id*="job-description"]',
  '[id*="jobDescription"]',
  '[class*="description"]',
  "article",
  "main",
];

export const TITLE_SELECTORS = [
  ".top-card-layout__title",
  ".topcard__title",
  ".jobsearch-JobInfoHeader-title",
  ".app-title",
  ".posting-headline h2",
  '[data-automation-id="jobPostingHeader"]',
  'h1[class*="title"]',
  'h1[class*="job"]',
  "h1",
];

export const COMPANY_SELECTORS = [
  ".topcard__org-name-link",
  ".top-card-layout__company",
  '[data-testid="inlineHeader-companyName"]',
  ".jobsearch-InlineCompanyRating-companyHeader",
  ".company-name",
  ".posting-headline .company",
  '[class*="company"]',
  '[class*="employer"]',
  '[class*="organization"]',
];

export function extractFromJsonLd(
  $: CheerioAPI
): { title?: string; company?: string; description?: string } {
  const result: { title?: string; company?: string; description?: string } = {};

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || "");
      const job = data["@type"] === "JobPosting" ? data : null;
      if (job) {
        result.title = job.title;
        result.company =
          typeof job.hiringOrganization === "string"
            ? job.hiringOrganization
            : job.hiringOrganization?.name;
        result.description = job.description;
      }
    } catch {
      // ignore malformed JSON-LD
    }
  });

  return result;
}

export function extractWithSelectors(
  $: CheerioAPI,
  selectors: string[]
): string | undefined {
  for (const sel of selectors) {
    const el = $(sel).first();
    if (el.length) {
      const text = el.text().trim();
      if (text.length > 2) return text;
    }
  }
  return undefined;
}

export function extractDescription(
  $: CheerioAPI,
  selectors: string[]
): string | undefined {
  for (const sel of selectors) {
    const el = $(sel).first();
    if (el.length) {
      const text = el
        .text()
        .replace(/\s+/g, " ")
        .replace(/ ([A-Z])/g, "\n$1")
        .trim();
      if (text.length > 50) return text;
    }
  }
  return undefined;
}

export function inferSourceFromUrl(url: string): string {
  const host = new URL(url).hostname.toLowerCase();
  if (host.includes("linkedin")) return "LinkedIn";
  if (host.includes("indeed")) return "Indeed";
  if (host.includes("greenhouse")) return "Greenhouse";
  if (host.includes("lever")) return "Lever";
  if (host.includes("workday")) return "Workday";
  if (host.includes("glassdoor")) return "Glassdoor";
  if (host.includes("ziprecruiter")) return "ZipRecruiter";
  if (host.includes("dice")) return "Dice";
  if (host.includes("angel") || host.includes("wellfound")) return "Wellfound";
  if (host.includes("builtin")) return "Built In";
  if (host.includes("swooped")) return "Swooped";
  return host.replace("www.", "").split(".")[0];
}

export function isPrivateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host.startsWith("172.") ||
      host === "[::1]" ||
      parsed.protocol === "file:"
    );
  } catch {
    return true;
  }
}
