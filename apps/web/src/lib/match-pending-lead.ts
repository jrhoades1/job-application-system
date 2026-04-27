import { extractPostingId } from "@/lib/posting-id";

export interface PendingLeadCandidate {
  id: string;
  company: string | null;
  role: string | null;
  career_page_url: string | null;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

function fuzzyEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = norm(a ?? "");
  const nb = norm(b ?? "");
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

/**
 * Pick the pending_review lead an extension import should update in place.
 *
 * Match precedence:
 *   1. Exact `career_page_url` match
 *   2. Canonical posting-id match (handles `/jobs/view/X`, `/comm/jobs/view/X`,
 *      and `?currentJobId=X` variants on LinkedIn, plus other ATS forms)
 *   3. Single-match fuzzy fallback on company + role — only fires when exactly
 *      one pending lead matches both fields. If two or more match, returns null
 *      to avoid hijacking an unrelated lead.
 *
 * Returns the matched lead, or null if no safe match exists.
 */
export function pickPendingLeadToUpdate(
  leads: PendingLeadCandidate[],
  url: string,
  company: string,
  role: string,
): PendingLeadCandidate | null {
  for (const l of leads) {
    if (l.career_page_url === url) return l;
  }

  const key = extractPostingId(url);
  if (key) {
    for (const l of leads) {
      if (l.career_page_url && extractPostingId(l.career_page_url) === key) {
        return l;
      }
    }
  }

  const fuzzy = leads.filter(
    (l) => fuzzyEqual(l.company, company) && fuzzyEqual(l.role, role),
  );
  if (fuzzy.length === 1) return fuzzy[0];

  return null;
}
