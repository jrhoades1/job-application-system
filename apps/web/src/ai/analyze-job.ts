/**
 * AI-enhanced job analysis prompt template.
 * Based on job-intake skill from job-application-system.
 *
 * Two-tier approach: algorithmic scorer runs first, then Claude enhances
 * with gap classification and strategic insights.
 */

import type { ExtractedRequirements } from "@/scoring";
import type { RequirementMatch } from "@/scoring";
import type { OverallScore } from "@/scoring";

export interface AnalysisInput {
  jobDescription: string;
  company: string;
  role: string;
  requirements: ExtractedRequirements;
  matches: RequirementMatch[];
  score: OverallScore;
  achievements: string; // Markdown text of user achievements
}

export interface AIAnalysisResult {
  summary: string;
  addressable_gaps: string[];
  hard_gaps: string[];
  strategic_notes: string;
  recommended_action: "apply" | "consider" | "skip";
  tailoring_intensity: "light" | "moderate" | "heavy";
}

export function buildAnalyzeJobPrompt(input: AnalysisInput): string {
  const gapList = input.matches
    .filter((m) => m.match_type === "gap")
    .map((m) => `- ${m.requirement}`)
    .join("\n");

  const strongList = input.matches
    .filter((m) => m.match_type === "strong")
    .map((m) => `- ${m.requirement} → ${m.evidence}`)
    .join("\n");

  const partialList = input.matches
    .filter((m) => m.match_type === "partial")
    .map((m) => `- ${m.requirement} → ${m.evidence}`)
    .join("\n");

  return `You are an expert career advisor analyzing a job posting match for a candidate.

## Job Posting
**Company:** ${input.company}
**Role:** ${input.role}

**Description:**
${input.jobDescription.slice(0, 8000)}

## Algorithmic Score Result
**Overall:** ${input.score.overall} (${input.score.match_percentage}% match)
- Strong matches: ${input.score.strong_count}
- Partial matches: ${input.score.partial_count}
- Gaps: ${input.score.gap_count}

### Strong Matches
${strongList || "None"}

### Partial Matches
${partialList || "None"}

### Gaps
${gapList || "None"}

## Candidate Achievements
${input.achievements.slice(0, 4000)}

## Your Task

Enhance the algorithmic analysis with these specific outputs:

1. **Summary** (2-3 sentences): Overall fit assessment in plain language.

2. **Addressable Gaps**: Which gaps could the candidate realistically address through adjacent experience, transferable skills, or quick learning? Explain how.

3. **Hard Gaps**: Which gaps are genuine blockers that can't be easily bridged?

4. **Strategic Notes**: Any insights about the role, company, or positioning strategy.

5. **Recommended Action**: "apply" (strong/good fit), "consider" (stretch but worth it), or "skip" (too many hard gaps).

6. **Tailoring Intensity**: "light" (strong match, minor keyword optimization), "moderate" (good match, need to emphasize certain areas), or "heavy" (stretch match, need creative positioning).

Respond in JSON format:
{
  "summary": "...",
  "addressable_gaps": ["gap: how to address it", ...],
  "hard_gaps": ["gap description", ...],
  "strategic_notes": "...",
  "recommended_action": "apply|consider|skip",
  "tailoring_intensity": "light|moderate|heavy"
}`;
}
