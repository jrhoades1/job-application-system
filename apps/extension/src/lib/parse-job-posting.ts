/**
 * Extract title / company / description from schema.org JobPosting JSON-LD.
 *
 * Most major ATS platforms (LinkedIn, Greenhouse, Lever, Workday on canonical
 * detail pages, Radancy, etc.) embed a `<script type="application/ld+json">`
 * blob with a `JobPosting` object. When present, this is the single most
 * reliable extraction source — it survives DOM/CSS class churn that breaks
 * selector-based extraction.
 *
 * This function is pure (takes raw script text, returns parsed fields) so it
 * can be unit-tested without a DOM. The content script is responsible for
 * collecting the JSON strings via querySelectorAll.
 *
 * Returns an empty object when no JobPosting is found — callers should fall
 * through to DOM selectors / page-title parsing.
 */

export interface JobPostingFields {
  title?: string;
  company?: string;
  description?: string;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function isJobPosting(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const t = (node as { "@type"?: unknown })["@type"];
  if (t === "JobPosting") return true;
  if (Array.isArray(t) && t.includes("JobPosting")) return true;
  return false;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function pickFromJobPosting(node: Record<string, unknown>): JobPostingFields {
  const title = asString(node.title);

  // hiringOrganization can be a string or an Organization object with `name`.
  let company: string | undefined;
  const org = node.hiringOrganization;
  if (typeof org === "string") company = asString(org);
  else if (org && typeof org === "object") company = asString((org as { name?: unknown }).name);

  const rawDesc = asString(node.description);
  const description = rawDesc ? stripHtml(rawDesc) : undefined;

  return { title, company, description };
}

/**
 * Walk a JSON-LD value (could be a JobPosting object, an array, or a
 * `@graph`-wrapped container) and return the first JobPosting found.
 */
function findJobPosting(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJobPosting(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  if (isJobPosting(value)) return value as Record<string, unknown>;
  // Common wrapper: { "@graph": [ ..., JobPosting, ... ] }
  const graph = (value as { "@graph"?: unknown })["@graph"];
  if (graph) return findJobPosting(graph);
  return null;
}

export function parseJobPostingJsonLd(scriptTexts: string[]): JobPostingFields {
  for (const raw of scriptTexts) {
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Some sites ship malformed JSON-LD — skip rather than throw.
      continue;
    }
    const node = findJobPosting(parsed);
    if (node) {
      const fields = pickFromJobPosting(node);
      if (fields.title || fields.company || fields.description) return fields;
    }
  }
  return {};
}
