/**
 * Lead filter — Stage 1 knockouts and Stage 2 score floor.
 *
 * Stage 1 runs during Gmail sync on stub data (role title, location string).
 * It only applies deterministic knockouts that don't depend on score quality:
 * seniority, location, salary, explicit role mismatch. If any of these fail,
 * the lead is routed to `auto_skipped` with a reason.
 *
 * Stage 2 is the match-score floor. It is ONLY applied to real-JD scores
 * (score_source === "scored"). Stub scores are fail-open — they go through
 * to pending_review until background enrichment fetches a real JD.
 */

export type SeniorityLevel =
  | "intern"
  | "junior"
  | "mid"
  | "senior"
  | "lead"
  | "manager"
  | "director"
  | "vp"
  | "c_level";

const SENIORITY_ORDER: SeniorityLevel[] = [
  "intern",
  "junior",
  "mid",
  "senior",
  "lead",
  "manager",
  "director",
  "vp",
  "c_level",
];

export const SENIORITY_LABELS: Record<SeniorityLevel, string> = {
  intern: "Intern",
  junior: "Junior",
  mid: "Mid-level",
  senior: "Senior",
  lead: "Lead / Staff",
  manager: "Manager",
  director: "Director",
  vp: "VP",
  c_level: "C-Level",
};

export type Discipline =
  | "engineering"
  | "product"
  | "design"
  | "data"
  | "sales"
  | "marketing"
  | "hr"
  | "finance"
  | "legal"
  | "operations"
  | "support"
  | "medical"
  | "content";

// Disciplines a software engineer is categorically not a candidate for.
// Reject-list approach: anything not in this set passes through.
const REJECTED_DISCIPLINES: ReadonlySet<Discipline> = new Set([
  "sales",
  "marketing",
  "hr",
  "finance",
  "legal",
  "operations",
  "support",
  "medical",
  "content",
]);

/**
 * Detect the functional discipline from a role title. Returns null when
 * ambiguous so callers can fail-open.
 */
export function detectDiscipline(roleTitle: string): Discipline | null {
  if (!roleTitle) return null;
  const t = roleTitle.toLowerCase();

  // Sales — check before generic "account"/"business" terms. Matches common
  // enterprise-sales titles like "Key Account Director", "Strategic Account
  // Manager", "Enterprise Account Executive", etc.
  if (/\b(sales|(key|strategic|enterprise|global|regional|national|named)\s+account|account\s+(executive|manager|director|lead)|business\s+development|bdr|sdr|revenue|go[- ]to[- ]market|gtm)\b/.test(t)) return "sales";
  // Marketing
  if (/\b(marketing|brand|growth\s+marketer|seo|content\s+strateg|communications|pr\s+manager|demand\s+gen)\b/.test(t)) return "marketing";
  // HR / People
  if (/\b(human\s+resources|hr\b|people\s+operations|talent\s+acquisition|recruit(er|ing)|people\s+partner)\b/.test(t)) return "hr";
  // Finance / Accounting
  if (/\b(accountant|accounting|finance|financial\s+analyst|controller|treasurer|bookkeep|auditor|tax)\b/.test(t)) return "finance";
  // Legal
  if (/\b(legal|attorney|counsel|paralegal|compliance\s+officer)\b/.test(t)) return "legal";
  // Medical / Clinical
  if (/\b(nurse|physician|doctor|clinical|medical\s+assistant|pharmacist|therapist|dentist)\b/.test(t)) return "medical";
  // Content / creator / host (Twitch-style roles — streamers, language hosts,
  // notebook associates, copywriters). Distinct from "content strategy"
  // (marketing) which is caught above.
  if (/\b(streamer|copywriter|notebook\s+associate|content\s+(creator|producer|contractor|associate)|(spanish|english|french|german|portuguese|japanese|korean|mandarin|cantonese|chinese|italian|russian|arabic|hindi|native|language)\s+hosts?)\b/.test(t)) return "content";
  // Customer support
  if (/\b(customer\s+(support|success|service)|support\s+(agent|representative|specialist)|help\s+desk)\b/.test(t)) return "support";
  // Operations / procurement (only clear ops/procurement titles, not
  // "engineering operations"). Includes strategic sourcing, category mgmt,
  // procurement, purchasing.
  if (/\b(operations\s+(manager|director|lead)|supply\s+chain|logistics|warehouse|facilities|strategic\s+sourcing|category\s+management|procurement|purchasing|sourcing\s+(manager|director|lead))\b/.test(t)) return "operations";

  // Engineering / technical — broad catch for anything that should pass.
  // Uses engineer(ing)? so both "Engineer" and "Engineering" match; covers
  // "Director of Engineering", "Head of Platform Engineering", etc.
  if (/\b(engineer(ing)?|developer|programmer|architect|sre|devops|platform|infrastructure|full[- ]?stack|backend|frontend|software|technology|technical|cto|cio)\b/.test(t)) return "engineering";
  // Product
  if (/\b(product\s+manager|product\s+owner|product\s+lead|cpo|head\s+of\s+product)\b/.test(t)) return "product";
  // Design
  if (/\b(designer|ux|ui|user\s+experience|creative\s+director)\b/.test(t)) return "design";
  // Data / ML — accept "Data Science" (the field) alongside "Data Scientist".
  // Without the bare "science" branch, titles like "Director Data Science" or
  // "Senior Director, Data Science — NextGen Forecasting" fall through to
  // null and get rejected in strict mode.
  if (/\b(data\s+(scientist|science|analyst|engineer)|machine\s+learning|ml\s+engineer|ai\s+engineer|analytics)\b/.test(t)) return "data";

  return null;
}

/**
 * Classify a role title into a seniority bucket. Returns null when the title
 * is too ambiguous to classify — callers should fail-open on null.
 */
export function detectSeniority(roleTitle: string): SeniorityLevel | null {
  if (!roleTitle) return null;
  const t = roleTitle.toLowerCase();

  // Most specific first — check C-level before "director" since CTO contains neither
  if (/\b(ceo|cto|cio|cfo|coo|cpo|chief\s+[a-z]+\s+officer)\b/.test(t)) return "c_level";
  if (/\b(svp|senior\s+vice\s+president|evp|executive\s+vice\s+president|vp|vice\s+president)\b/.test(t)) return "vp";
  if (/\b(head\s+of|director|sr\.?\s+director|senior\s+director)\b/.test(t)) return "director";
  if (/\b(engineering\s+manager|product\s+manager|program\s+manager|project\s+manager|people\s+manager|manager|mgr)\b/.test(t)) return "manager";
  if (/\b(staff|principal|lead|tech\s+lead|technical\s+lead|architect)\b/.test(t)) return "lead";
  if (/\b(sr\.?|senior)\b/.test(t)) return "senior";
  if (/\b(jr\.?|junior|entry[- ]level|associate|graduate|new\s+grad)\b/.test(t)) return "junior";
  if (/\b(intern|internship)\b/.test(t)) return "intern";
  // Bare "engineer", "developer", "analyst" without modifiers — treat as mid
  if (/\b(engineer|developer|analyst|designer|scientist|specialist)\b/.test(t)) return "mid";

  return null;
}

/**
 * Parse a salary string (from email or JD) into a minimum annual dollar amount.
 * Returns null when no number can be extracted.
 */
export function parseSalaryMin(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/,/g, "");

  // Match "$120k - $160k", "120000 - 160000", "$120,000", etc.
  const matches = Array.from(s.matchAll(/\$?\s*(\d+(?:\.\d+)?)\s*(k|m)?/g));
  if (matches.length === 0) return null;

  const nums = matches
    .map((m) => {
      const n = parseFloat(m[1]);
      if (isNaN(n)) return null;
      if (m[2] === "k") return n * 1000;
      if (m[2] === "m") return n * 1_000_000;
      // If the bare number looks like "120" and there's a k/m nearby, already handled.
      // Bare "120000" is already dollars. Bare "120" without k is probably not a salary.
      if (n < 1000) return null;
      return n;
    })
    .filter((n): n is number => n !== null);

  if (nums.length === 0) return null;
  return Math.min(...nums);
}

export interface LeadFilterPrefs {
  lead_filter_enabled?: boolean;
  lead_filter_min_score?: number; // Stage 2 floor, applied to real-JD scores only
  min_role_level?: string; // SeniorityLevel, from bullseye prefs
  salary_min?: number | null;
  remote_preference?: "remote" | "hybrid" | "onsite" | "any";
}

export interface Stage1Input {
  role: string;
  company: string;
  location?: string | null;
  compensation?: string | null;
  description_text?: string | null;
}

export interface Stage1Result {
  pass: boolean;
  reason?: string;
}

export interface Stage1Options {
  /**
   * Strict mode for career-scan: fail-closed on ambiguous titles.
   *
   * - Discipline must be explicitly engineering/product/data (null → reject)
   * - Seniority must be explicitly detected and meet min_role_level
   *   (null → reject)
   *
   * Email-pipeline callers leave this off to preserve fail-open behavior
   * on noisy digest data.
   */
  strict?: boolean;
}

// Strict mode for career-scan targeting engineering + data/ML leadership.
// Product is intentionally excluded to prevent IC PM titles from flooding
// the feed (it's a distinct career track). Data is included because
// Director/VP Data Science, AI/ML leadership, and Analytics leadership
// are all active targets for this user; without it, titles like "Senior
// Principal Data Scientist" get classified as `data` and rejected.
const STRICT_ALLOWED_DISCIPLINES: ReadonlySet<Discipline> = new Set([
  "engineering",
  "data",
]);

// Compound non-engineering titles that would otherwise slip past the engineering
// classifier because the discipline regex is greedy on "technical" / "technology".
// These are coordination / customer-facing / partnerships roles — real jobs, but
// not engineering leadership. Applied only in strict mode.
const STRICT_TITLE_REJECT_PATTERNS: RegExp[] = [
  // Product Manager (inc. "Technical Product Manager", "Senior Product Manager,
  // Data Integration Platform"). Product is a distinct career track from
  // engineering leadership. Detected here because "technical"/"platform"/etc.
  // in the surrounding title trigger the engineering discipline regex first.
  /\bproduct\s+manager\b/i,
  // Project / Program Manager (including "Senior Technical Project Manager")
  /\b(technical\s+)?(project|program)\s+manager\b/i,
  // Technical Account / Partner / Support Manager — customer-facing, not eng
  /\btechnical\s+(account|partner|support|solutions)\s+(manager|lead|director)\b/i,
  // Generic partnerships titles — business development, not engineering
  /\b(partnerships?\s+(manager|lead|director|head)|partner\s+manager)\b/i,
  /\btechnology\s+partnerships?\b/i,
  // Technical writer / documentation
  /\btechnical\s+writer\b/i,
];

// South Florida cities within ~1 hour of West Palm Beach.
const SOUTH_FLORIDA_PATTERNS: RegExp[] = [
  /\bwest\s+palm\s+beach\b/,
  /\bpalm\s+beach\b/,
  /\bboca\s+raton\b/,
  /\bfort\s+lauderdale\b/,
  /\bft\.?\s+lauderdale\b/,
  /\bdelray\s+beach\b/,
  /\bboynton\s+beach\b/,
  /\bjupiter\b/,
  /\bstuart\b/,
  /\bport\s+st\.?\s+lucie\b/,
  /\bdeerfield\s+beach\b/,
  /\bpompano\s+beach\b/,
  /\bcoconut\s+creek\b/,
  /\bcoral\s+springs\b/,
  /\bplantation\b/,
  /\bsunrise\b/,
  /\bdavie\b/,
  /\bparkland\b/,
  /\bweston\b/,
  /\bmiramar\b/,
  /\bhollywood,?\s+fl\b/,
  /\bmiami\b/,
  /\bhialeah\b/,
  /\bhomestead\b/,
  /\bpalm\s+beach\s+gardens\b/,
  /\broyal\s+palm\s+beach\b/,
  /\bwellington,?\s+fl\b/,
  /\blake\s+worth\b/,
  /\briviera\s+beach\b/,
  /\bpalm\s+city\b/,
  /\bvero\s+beach\b/,
  // Broader FL matches — catch "South Florida", "Southeast Florida", "FL" with
  // a South FL context. We intentionally exclude Tampa/Orlando/Jacksonville.
  /\bsouth\s+florida\b/,
  /\bsoutheast\s+florida\b/,
  /\bsfl\b/,
  /\bbroward\b/,
  /\bpalm\s+beach\s+county\b/,
  /\bmiami[- ]dade\b/,
  /\bmartin\s+county\b/,
];

/** Returns true if the location string refers to South Florida (~1 hr of WPB). */
export function isSouthFlorida(location: string): boolean {
  const loc = location.toLowerCase();
  return SOUTH_FLORIDA_PATTERNS.some((p) => p.test(loc));
}

/**
 * Stage 1: deterministic knockouts. Only rejects on high-confidence mismatches.
 * Fail-open on ambiguity — a null seniority classification passes through.
 */
export function evaluateStage1(
  lead: Stage1Input,
  prefs: LeadFilterPrefs,
  options: Stage1Options = {}
): Stage1Result {
  if (!prefs.lead_filter_enabled) return { pass: true };
  const strict = options.strict === true;

  // Discipline knockout.
  // - Normal mode: reject only if discipline is explicitly in the reject-list
  //   (fail-open on null — good for noisy email digest titles).
  // - Strict mode: require discipline to be explicitly engineering/product/
  //   data. Null or outside the allow-list → reject.
  const discipline = detectDiscipline(lead.role);
  if (strict) {
    if (discipline === null || !STRICT_ALLOWED_DISCIPLINES.has(discipline)) {
      return {
        pass: false,
        reason: `Ambiguous or non-technical title: "${lead.role}"`,
      };
    }
    // Second-pass: reject compound non-engineering leadership titles that
    // match the engineering discipline regex via "technical" / "technology".
    for (const pattern of STRICT_TITLE_REJECT_PATTERNS) {
      if (pattern.test(lead.role)) {
        return {
          pass: false,
          reason: `Non-engineering leadership title: "${lead.role}"`,
        };
      }
    }
  } else if (discipline !== null && REJECTED_DISCIPLINES.has(discipline)) {
    return {
      pass: false,
      reason: `Discipline mismatch: ${discipline} role, engineering preferred`,
    };
  }

  // Seniority knockout.
  // - Normal mode: fail-open on null detection.
  // - Strict mode: null detection is a rejection — we want an explicit
  //   match for career-scan results.
  if (prefs.min_role_level && prefs.min_role_level !== "any") {
    const minLevel = prefs.min_role_level as SeniorityLevel;
    const minIdx = SENIORITY_ORDER.indexOf(minLevel);
    if (minIdx >= 0) {
      const detected = detectSeniority(lead.role);
      if (detected === null) {
        if (strict) {
          return {
            pass: false,
            reason: `Seniority unclear: "${lead.role}" — explicit level required`,
          };
        }
      } else {
        const detectedIdx = SENIORITY_ORDER.indexOf(detected);
        if (detectedIdx < minIdx) {
          return {
            pass: false,
            reason: `Seniority mismatch: ${SENIORITY_LABELS[detected]} < ${SENIORITY_LABELS[minLevel]} required`,
          };
        }
      }
    }
  }

  // Location knockout — two checks:
  // 1. If it mentions remote/hybrid, it passes (regardless of other location text).
  // 2. If it has a physical location, it must be in South Florida (~1 hr of West Palm Beach).
  // 3. Null/empty location fails open — don't reject what we can't classify.
  //
  // The role title is included in the remote-detection corpus because many
  // ATS feeds (UHG/Radancy, Workday) encode remote-ness in the TITLE but
  // still report a physical office in the location field. Example:
  // "Director of AI/ML Engineering Remote Nationwide" @ "Eden Prairie, MN".
  {
    const locText = (lead.location ?? "").toLowerCase();
    const descText = (lead.description_text ?? "").toLowerCase();
    const titleText = (lead.role ?? "").toLowerCase();
    const combined = `${locText} ${descText} ${titleText}`;
    const isRemoteOrHybrid = /\b(remote|work from home|work from anywhere|hybrid|telecommute|distributed|nationwide)\b/.test(combined);

    if (!isRemoteOrHybrid && locText.length > 0) {
      // Check for South Florida (within ~1 hr of West Palm Beach)
      if (!isSouthFlorida(locText)) {
        return {
          pass: false,
          reason: `Location mismatch: "${lead.location}" — not South Florida or remote`,
        };
      }
    }
  }

  // Salary knockout (only when compensation is parseable AND below floor)
  if (prefs.salary_min && prefs.salary_min > 0) {
    const detected = parseSalaryMin(lead.compensation ?? null);
    if (detected !== null && detected < prefs.salary_min) {
      return {
        pass: false,
        reason: `Salary below floor: ~$${Math.round(detected / 1000)}k < $${Math.round(prefs.salary_min / 1000)}k`,
      };
    }
  }

  return { pass: true };
}

/**
 * Stage 2: match-score floor. ONLY applies to real-JD scores.
 * Stub scores always pass — they wait for background enrichment.
 */
export function evaluateStage2(
  matchPercentage: number | null | undefined,
  scoreSource: string | null | undefined,
  prefs: LeadFilterPrefs
): Stage1Result {
  if (!prefs.lead_filter_enabled) return { pass: true };
  if (scoreSource !== "scored") return { pass: true }; // fail-open on stubs
  const floor = prefs.lead_filter_min_score ?? 40;
  if (matchPercentage == null) return { pass: true };
  if (matchPercentage < floor) {
    return {
      pass: false,
      reason: `Match ${Math.round(matchPercentage)}% below floor ${floor}%`,
    };
  }
  return { pass: true };
}
