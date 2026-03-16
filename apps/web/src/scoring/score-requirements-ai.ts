/**
 * AI-powered requirement scoring using Haiku.
 *
 * Replaces the word-overlap scorer with semantic matching.
 * Sends all requirements + achievements in one call per lead,
 * returns structured RequirementMatch[] compatible with calculateOverallScore.
 */

import { createTrackedMessage } from "@/lib/anthropic";
import type { RequirementMatch } from "./score-requirement";

/**
 * Score all requirements for a job against the user's achievements using AI.
 * One Haiku call per lead — returns the same RequirementMatch[] structure
 * that calculateOverallScore expects.
 */
export async function scoreRequirementsWithAI(
  requirements: string[],
  achievements: Record<string, string[]>,
  context?: { role?: string; company?: string }
): Promise<RequirementMatch[]> {
  if (requirements.length === 0) return [];

  // Format achievements into a readable block
  const achievementLines: string[] = [];
  for (const [category, items] of Object.entries(achievements)) {
    if (items.length === 0) continue;
    achievementLines.push(`[${category}]`);
    for (const item of items) {
      achievementLines.push(`- ${item}`);
    }
  }

  if (achievementLines.length === 0) {
    return requirements.map((r) => ({
      requirement: r,
      match_type: "gap",
      evidence: "",
      category: "",
    }));
  }

  const numberedReqs = requirements
    .map((r, i) => `${i + 1}. ${r}`)
    .join("\n");

  const roleContext = context?.role
    ? ` for a "${context.role}" position${context.company ? ` at ${context.company}` : ""}`
    : "";

  const response = await createTrackedMessage(
    {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `Score how well this candidate's achievements match each job requirement${roleContext}.

REQUIREMENTS:
${numberedReqs}

CANDIDATE ACHIEVEMENTS:
${achievementLines.join("\n")}

For each requirement, return a JSON array with one object per requirement:
- "index": the requirement number (1-based)
- "match": "strong" if the candidate clearly meets this requirement with direct evidence, "partial" if they have related/transferable experience, "gap" if they lack this experience
- "evidence": the specific achievement that best supports the match (empty string if gap)
- "category": which achievement category the evidence came from (empty string if gap)

Be honest and critical. "strong" means the achievement is direct, relevant evidence — not just keyword overlap. "partial" means transferable or adjacent experience. "gap" means nothing in their background supports this.

Return ONLY a JSON array, no other text.`,
        },
      ],
    },
    "requirement_scoring"
  );

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    // AI call succeeded but returned unparseable output — fall back
    return [];
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      index: number;
      match: string;
      evidence: string;
      category: string;
    }>;

    return requirements.map((req, i) => {
      const result = parsed.find((p) => p.index === i + 1);
      if (!result) {
        return {
          requirement: req,
          match_type: "gap" as const,
          evidence: "",
          category: "",
        };
      }

      const matchType =
        result.match === "strong"
          ? "strong"
          : result.match === "partial"
            ? "partial"
            : "gap";

      return {
        requirement: req,
        match_type: matchType as "strong" | "partial" | "gap",
        evidence: typeof result.evidence === "string" ? result.evidence : "",
        category: typeof result.category === "string" ? result.category : "",
      };
    });
  } catch {
    // JSON parse failed — return empty so caller falls back
    return [];
  }
}
