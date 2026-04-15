/**
 * Pure helpers for auto-processing rejection emails during Gmail sync.
 *
 * Split out from the sync route so the matching + reason-extraction logic can
 * be unit tested without pulling in the full sync pipeline. The sync route
 * handles the side effects (DB updates, Gmail archive, history log).
 *
 * Safety: only "high" confidence matches should be auto-applied. Medium/low
 * matches are left alone so the user can triage them manually.
 */

export interface AppliedAppRef {
  id: string;
  company: string;
  role: string;
  status: string;
}

export type MatchConfidence = "high" | "medium" | "low";

export interface RejectionMatch {
  appId: string;
  confidence: MatchConfidence;
  matchedOn: "exact" | "exact+role" | "substring" | "substring+role";
}

/**
 * Normalize a company name for matching. Mirrors `normalizeCompany` in the
 * sync route but kept local so this module is zero-dependency and unit-testable.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s*(inc\.?|llc|ltd\.?|corp\.?|corporation|co\.?|group|plc)\s*$/i, "")
    .replace(/[.,'"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Score how well a role string in an application matches content in the email
 * (subject or first chunk of body). Used to disambiguate when a company has
 * multiple applied roles. Returns true if any role token (3+ chars) appears in
 * the haystack.
 */
function roleMentioned(roleText: string, haystack: string): boolean {
  const tokens = roleText
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  if (tokens.length === 0) return false;
  const hay = haystack.toLowerCase();
  // Require at least 2 distinct meaningful tokens to match, or a single long
  // token (5+ chars) — stops single-word noise like "director" from matching.
  const hits = tokens.filter((t) => hay.includes(t));
  if (hits.length >= 2) return true;
  if (hits.length === 1 && hits[0].length >= 6) return true;
  return false;
}

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "your",
  "our",
  "this",
  "that",
  "from",
  "team",
  "role",
  "position",
  "job",
  "department",
  "of",
  "in",
  "at",
  "to",
  "a",
  "an",
]);

/**
 * Attempt to match a rejection email to a single applied/interviewing row.
 *
 * Strategy:
 *  1. Normalize candidate company name (from extractor).
 *  2. Exact company match → high confidence. If multiple, try role
 *     disambiguation in subject+body; otherwise medium.
 *  3. Substring/fuzzy company match → medium. If role disambiguates, high.
 *  4. No match → null.
 *
 * The caller should only auto-apply rejections for "high" confidence.
 */
export function matchRejectionToApp(
  candidateCompany: string | null,
  subject: string,
  bodySnippet: string,
  apps: AppliedAppRef[]
): RejectionMatch | null {
  if (!candidateCompany || apps.length === 0) return null;

  const normalized = normalizeName(candidateCompany);
  if (normalized.length < 2) return null;

  const haystack = `${subject}\n${bodySnippet.slice(0, 3000)}`;

  const exact = apps.filter((a) => normalizeName(a.company) === normalized);
  if (exact.length === 1) {
    return { appId: exact[0].id, confidence: "high", matchedOn: "exact" };
  }
  if (exact.length > 1) {
    const byRole = exact.find((a) => roleMentioned(a.role, haystack));
    if (byRole) {
      return { appId: byRole.id, confidence: "high", matchedOn: "exact+role" };
    }
    // Ambiguous — multiple apps at the same company, nothing to break the tie.
    return { appId: exact[0].id, confidence: "medium", matchedOn: "exact" };
  }

  // No exact match — try substring either direction.
  const fuzzy = apps.filter((a) => {
    const appNorm = normalizeName(a.company);
    if (appNorm.length < 3 || normalized.length < 3) return false;
    return appNorm.includes(normalized) || normalized.includes(appNorm);
  });
  if (fuzzy.length === 1) {
    const single = fuzzy[0];
    const confidence: MatchConfidence = roleMentioned(single.role, haystack)
      ? "high"
      : "medium";
    return {
      appId: single.id,
      confidence,
      matchedOn: confidence === "high" ? "substring+role" : "substring",
    };
  }
  if (fuzzy.length > 1) {
    const byRole = fuzzy.find((a) => roleMentioned(a.role, haystack));
    if (byRole) {
      return {
        appId: byRole.id,
        confidence: "high",
        matchedOn: "substring+role",
      };
    }
  }

  return null;
}

/**
 * Extract the original sender (company name) from a forwarded email body.
 *
 * Gmail-forwarded messages embed a "---------- Forwarded message ---------"
 * block followed by a `From: "Display Name" <addr@domain>` header that names
 * the real sender. When the outer From: is the user themselves, this is the
 * only reliable way to learn who the email was actually from.
 *
 * Returns the best candidate company name (prefer display name when it looks
 * like a company; fall back to domain) or null if nothing parseable is found.
 */
export function extractForwardedSender(body: string): string | null {
  if (!body) return null;

  // Find the forwarded-header block.
  const markerMatch = body.match(/---+\s*Forwarded message\s*---+/i);
  if (!markerMatch) return null;

  const after = body.slice(markerMatch.index! + markerMatch[0].length);
  const headerBlock = after.slice(0, 1500);

  // Grab the inner "From: ..." line.
  const fromLine = headerBlock.match(/^\s*From:\s*(.+?)$/m);
  if (!fromLine) return null;
  const fromRaw = fromLine[1].trim();

  // Separate display name from address.
  const angleMatch = fromRaw.match(/^"?([^"<]+?)"?\s*<([^>]+)>\s*$/);
  let displayName = "";
  let address = "";
  if (angleMatch) {
    displayName = angleMatch[1].trim();
    address = angleMatch[2].trim();
  } else {
    // Bare address or bare name
    if (/@/.test(fromRaw)) {
      address = fromRaw;
    } else {
      displayName = fromRaw;
    }
  }

  // Prefer display name if it looks like a company (not a noreply/generic bot).
  const NOISY_NAMES =
    /^(no-?reply|notifications?|careers?|jobs?|talent|recruiting|hr|workday|mail)$/i;
  if (displayName && !NOISY_NAMES.test(displayName.replace(/\s+/g, ""))) {
    // Strip common "Workday" suffix from things like "NikeWorkday"
    const cleaned = displayName.replace(/\s*Workday\s*$/i, "").trim();
    if (cleaned.length >= 2) return cleaned;
  }

  // Fall back to domain name, stripped of TLD.
  const domainMatch = address.match(/@([a-zA-Z0-9.-]+)/);
  if (domainMatch) {
    const host = domainMatch[1].toLowerCase();
    // Skip generic mail/consumer domains and Workday tenant subdomains.
    if (/^(gmail|outlook|yahoo|hotmail|icloud|aol|proton|mail)\./.test(host + ".")) {
      return null;
    }
    // myworkday.com tenants look like foo@companyname.myworkday.com —
    // wait, actually they're structured as foo@myworkday.com with the tenant
    // baked into the localpart. For "nike@myworkday.com" the domain is
    // "myworkday.com" so we can't get the company from it; fall through.
    if (/myworkday\.com$/i.test(host)) {
      // Try localpart — "nike@myworkday.com" → "nike"
      const localpart = address.split("@")[0];
      if (localpart && localpart.length >= 2 && !NOISY_NAMES.test(localpart)) {
        return localpart.charAt(0).toUpperCase() + localpart.slice(1);
      }
      return null;
    }
    // Strip TLD: "smithrx.com" → "smithrx"
    const base = host.replace(/\.(com|org|io|co|net|ai|us|app|health|health)$/i, "");
    // Handle subdomains: "careers.company.com" → "company"
    const parts = base.split(".");
    const core = parts[parts.length - 1];
    if (core && core.length >= 2) {
      return core.charAt(0).toUpperCase() + core.slice(1);
    }
  }

  return null;
}

/**
 * Extract a short, human-readable rejection reason from the email body. Grabs
 * the sentence containing the strongest rejection phrase, trims boilerplate,
 * caps length. Falls back to a generic label if nothing specific is found.
 */
export function extractRejectionReason(body: string): string {
  if (!body) return "Automated rejection — no body text captured.";

  // Normalize whitespace
  const text = body.replace(/\s+/g, " ").trim();

  // Strongest signals first — look for the sentence that contains them.
  const signalPatterns: RegExp[] = [
    /[^.]*?(move forward with (?:other|candidates))[^.]*\./i,
    /[^.]*?(pursue other candidate)[^.]*\./i,
    /[^.]*?(decided to (?:move|go) forward with)[^.]*\./i,
    /[^.]*?(more closely align)[^.]*\./i,
    /[^.]*?(we have decided)[^.]*\./i,
    /[^.]*?(not (?:a |the )?right (?:fit|opportunity))[^.]*\./i,
    /[^.]*?(unfortunately[^.]{0,120})\./i,
    /[^.]*?(after careful (?:review|consideration)[^.]*)\./i,
  ];

  for (const re of signalPatterns) {
    const m = text.match(re);
    if (m && m[0]) {
      const sentence = m[0].trim();
      // Cap at 300 chars — enough for context, not whole paragraphs.
      return sentence.length > 300 ? sentence.slice(0, 297) + "..." : sentence;
    }
  }

  return "Automated rejection — generic decline, no specific reason given.";
}
