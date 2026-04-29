/**
 * Parse a job-page browser tab title into { title, company, degraded }.
 *
 * Used by the extension's content script and the corresponding unit tests in
 * apps/web/tests/capture-jd.test.ts. Both call this function — never reimplement
 * it inline. (The original LinkedIn search-panel "company=LinkedIn" bug was
 * caused by a parallel duplicate copy in the test that drifted from the real
 * one.)
 */

/**
 * Job-board hostnames whose name leaks into page titles as " | LinkedIn",
 * " | Indeed.com", etc. If our parser would otherwise return one of these as
 * the "company", treat the title as ambiguous and return undefined for the
 * company field — better to fail-soft than create a row with company="LinkedIn".
 */
const PLATFORM_NAMES = new Set<string>([
  "linkedin",
  "indeed",
  "indeed.com",
  "ziprecruiter",
  "glassdoor",
  "monster",
  "careerbuilder",
  "simplyhired",
  "dice",
  "builtin",
  "built in",
  "wellfound",
  "angellist",
  "workday",
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "icims",
]);

function isPlatformName(s: string | undefined): boolean {
  if (!s) return false;
  return PLATFORM_NAMES.has(s.trim().toLowerCase());
}

export interface ParsedTitle {
  title?: string;
  company?: string;
  /**
   * True when the title shape suggests the role slot was empty — e.g.
   * "| Geron Corporation | LinkedIn" (LinkedIn renders this when the page
   * hasn't fully hydrated, or for some "off-LinkedIn apply" listings).
   * Callers should treat this as a signal to either prompt a refresh or
   * lean harder on DOM/JSON-LD extraction.
   */
  degraded?: boolean;
}

export function parsePageTitle(pageTitle: string): ParsedTitle {
  // Strip leading notification count: "(2) Title..." → "Title..."
  const cleaned = pageTitle.replace(/^\(\d+\)\s*/, "");

  // Degraded shape: "| Company | Platform" (empty role slot before first sep).
  // LinkedIn ships this when the JD area hasn't hydrated — we still want to
  // recover the company if we can, but the caller needs to know not to write
  // a row with title="| Company".
  const leadingSep = cleaned.match(/^\s*[|\-–—]\s+(.+)$/);
  if (leadingSep) {
    const rest = leadingSep[1];
    const sepMatch = rest.match(/^(.+?)\s*[|\-–—]\s*/);
    if (sepMatch) {
      const company = sepMatch[1].trim();
      if (!isPlatformName(company)) return { company, degraded: true };
    }
    return { degraded: true };
  }

  // LinkedIn: "Perfecting Peds hiring Director of Engineering in United States | LinkedIn"
  const linkedinMatch = cleaned.match(/^(.+?)\s+hiring\s+(.+?)\s+in\s+/i);
  if (linkedinMatch) {
    const company = linkedinMatch[1].trim();
    const title = linkedinMatch[2].trim();
    return isPlatformName(company) ? { title } : { company, title };
  }

  // LinkedIn alt: "Director of Engineering - Perfecting Peds | LinkedIn"
  const linkedinAlt = cleaned.match(/^(.+?)\s*[-–—]\s*(.+?)\s*\|\s*LinkedIn/i);
  if (linkedinAlt) {
    const title = linkedinAlt[1].trim();
    const company = linkedinAlt[2].trim();
    return isPlatformName(company) ? { title } : { title, company };
  }

  // ZipRecruiter: "Role - Company | ZipRecruiter"
  const zipMatch = cleaned.match(/^(.+?)\s*[-–—]\s*(.+?)\s*\|\s*ZipRecruiter/i);
  if (zipMatch) {
    const title = zipMatch[1].trim();
    const company = zipMatch[2].trim();
    return isPlatformName(company) ? { title } : { title, company };
  }

  // Indeed: "Role - Company - Location | Indeed.com"
  const indeedMatch = cleaned.match(/^(.+?)\s*[-–—]\s*(.+?)\s*[-–—]/i);
  if (indeedMatch) {
    const title = indeedMatch[1].trim();
    const company = indeedMatch[2].trim();
    return isPlatformName(company) ? { title } : { title, company };
  }

  // Generic: "Role at Company" or "Role | Company"
  // Critical: on LinkedIn search-panel pages the tab title is something like
  //   "(3) Software Solutions Manager QuadMed | LinkedIn"
  // The generic match would capture company="LinkedIn" — which is what created
  // applications with company="LinkedIn" instead of "QuadMed" / "Nautilus Data
  // Technologies" before this guard existed. Returning undefined for company
  // forces the caller to fail import validation and surface a real error to
  // the user, rather than silently writing a junk row.
  const genericMatch = cleaned.match(/^(.+?)\s+(?:at|@|\|)\s+(.+?)(?:\s*[-–—|]|$)/i);
  if (genericMatch) {
    const title = genericMatch[1].trim();
    const company = genericMatch[2].trim();
    return isPlatformName(company) ? { title } : { title, company };
  }

  return {};
}
