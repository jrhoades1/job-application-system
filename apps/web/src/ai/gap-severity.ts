/**
 * AI prompt template for classifying a single resume gap by severity and
 * proposing a concrete mitigation grounded in the user's achievements.
 *
 * Model: Sonnet — cost-acceptable per-gap call (~$0.01) with strong grounding
 * to avoid hallucinating achievements the user does not have.
 *
 * Call this once per gap returned by scoreRequirement. Results are stored
 * back into match_scores.gaps[] as optional {severity, mitigation} fields.
 */

export type GapSeverity = "blocker" | "high" | "medium" | "low";

export interface GapSeverityInput {
  company: string;
  role: string;
  jobDescription: string;
  gap: string;
  achievementsMarkdown: string;
  /** Other requirements we matched strongly — helps Sonnet identify adjacent framing. */
  strongMatches: string[];
  archetype: string;
}

export interface GapSeverityResult {
  severity: GapSeverity;
  mitigation: string;
  cited_achievements: string[];
  /** True if Sonnet flagged that no relevant achievement exists — user must own it. */
  no_mitigation_available: boolean;
}

export function buildGapSeverityPrompt(input: GapSeverityInput): string {
  return `You are a career coach classifying a gap on a job application. Your job is to (a) tag how serious the gap is and (b) propose exactly one concrete mitigation the candidate can use in the resume, cover letter, or interview.

CRITICAL: You may ONLY cite achievements from the inventory below. If nothing in the inventory is relevant, say so honestly — do not invent or embellish.

## Target
Company: ${input.company}
Role: ${input.role}
Archetype: ${input.archetype}

## The gap to evaluate
"${input.gap}"

## Job description (for context)
${input.jobDescription.slice(0, 4000)}

## Other requirements already matched strongly (candidate has these)
${input.strongMatches.map((m) => `- ${m}`).join("\n") || "(none matched strongly)"}

## Achievement inventory (the ONLY source you may cite)
${input.achievementsMarkdown.slice(0, 8000)}

## Output format — STRICT JSON only, no prose before or after
{
  "severity": "blocker" | "high" | "medium" | "low",
  "mitigation": "One specific sentence. Must cite at least one achievement verbatim from the inventory, OR say 'No adjacent experience available — candidate must acknowledge this gap directly.'",
  "cited_achievements": ["exact substring(s) of inventory lines used"],
  "no_mitigation_available": true | false
}

## Severity rubric
- blocker: explicit "must have" in JD, no adjacent experience in inventory → high chance of resume rejection
- high: strong preference in JD, weak adjacent experience → significant disadvantage
- medium: preferred / nice-to-have in JD with plausible adjacent framing → usually surmountable
- low: boilerplate requirement, minor relevance, or candidate already has equivalent

## Writing rules for mitigation
- One sentence, under 30 words
- Cite a specific achievement by paraphrasing a line from the inventory
- Never invent metrics, dates, or achievements
- No em dashes
- Suggest where to deploy: "lead with in summary" / "cover letter paragraph 2" / "interview follow-up question"

Return ONLY the JSON object.`;
}

/**
 * Parse the strict JSON from Sonnet's response. Throws if malformed.
 * Caller should wrap in try/catch and fall back to a default severity.
 */
export function parseGapSeverityResponse(raw: string): GapSeverityResult {
  // Sonnet sometimes wraps JSON in ```json fences; strip them
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  const parsed = JSON.parse(cleaned);

  const validSeverities: GapSeverity[] = ["blocker", "high", "medium", "low"];
  if (!validSeverities.includes(parsed.severity)) {
    throw new Error(`invalid severity: ${parsed.severity}`);
  }
  if (typeof parsed.mitigation !== "string" || parsed.mitigation.length === 0) {
    throw new Error("missing or empty mitigation");
  }
  if (parsed.mitigation.includes("\u2014")) {
    throw new Error("em dash in mitigation (violates project rule)");
  }
  if (!Array.isArray(parsed.cited_achievements)) {
    throw new Error("cited_achievements must be an array");
  }
  return {
    severity: parsed.severity,
    mitigation: parsed.mitigation,
    cited_achievements: parsed.cited_achievements,
    no_mitigation_available: Boolean(parsed.no_mitigation_available),
  };
}

/**
 * Validate that the mitigation is actually grounded in the achievements
 * inventory. Returns true if at least one cited_achievement is a substring
 * of the inventory text, false otherwise. Used as a post-hoc grounding check.
 */
export function isGroundedInInventory(
  result: GapSeverityResult,
  achievementsMarkdown: string
): boolean {
  if (result.no_mitigation_available) return true;
  if (result.cited_achievements.length === 0) return false;
  const inventory = achievementsMarkdown.toLowerCase();
  return result.cited_achievements.some(
    (cite) => cite.length > 10 && inventory.includes(cite.toLowerCase().slice(0, 50))
  );
}
