/**
 * AI resume tailoring prompt template.
 * Based on resume-tailor skill from job-application-system.
 *
 * Intensity based on match score:
 * - Light (strong match): Minor keyword optimization, reorder bullets
 * - Moderate (good match): Emphasize relevant experience, inject keywords
 * - Heavy (stretch/long shot): Creative positioning, transferable skills focus
 */

export interface TailorResumeInput {
  baseResume: string;
  jobDescription: string;
  company: string;
  role: string;
  matchScore: string; // "strong" | "good" | "stretch" | "long_shot"
  keywords: string[];
  strongMatches: string[];
  gaps: string[];
  addressableGaps: string[];
  achievements: string;
  narrative: string;
}

export function buildTailorResumePrompt(input: TailorResumeInput): string {
  const intensity =
    input.matchScore === "strong"
      ? "light"
      : input.matchScore === "good"
        ? "moderate"
        : "heavy";

  const intensityGuide = {
    light: `LIGHT TAILORING:
- Reorder existing bullets to put most relevant first
- Inject 3-5 keywords naturally into existing descriptions
- Keep all content — just optimize ordering and word choice
- One-page format maintained`,
    moderate: `MODERATE TAILORING:
- Reorder sections and bullets by relevance to this role
- Inject 5-10 keywords from the posting
- Expand bullets that match requirements with more specific details
- Compress less relevant experience to make room
- One-page format mandatory`,
    heavy: `HEAVY TAILORING:
- Lead with transferable skills that map to requirements
- Reframe experience to highlight relevance to this role
- Inject 10+ keywords creatively but naturally
- Frame addressable gaps as adjacent expertise
- Compress or remove least relevant experience
- One-page format mandatory — be aggressive with compression`,
  };

  return `You are an expert resume writer tailoring a resume for a specific job application.

## Target Role
**Company:** ${input.company}
**Role:** ${input.role}
**Match Score:** ${input.matchScore}

## Tailoring Intensity: ${intensity.toUpperCase()}
${intensityGuide[intensity]}

## Keywords to Incorporate
${input.keywords.join(", ")}

## Strong Matches to Emphasize
${input.strongMatches.map((m) => `- ${m}`).join("\n") || "None identified"}

## Gaps to Address
${input.gaps.map((g) => `- ${g}`).join("\n") || "None"}

## Addressable Gaps (frame positively)
${input.addressableGaps.map((g) => `- ${g}`).join("\n") || "None"}

## Career Narrative
${input.narrative || "Not provided"}

## Base Resume
${input.baseResume}

## Instructions

Produce a tailored resume in Markdown format that:
1. Maintains the candidate's authentic experience — never fabricate
2. Optimizes for this specific role using keyword injection and bullet reordering
3. Fits on one page (aim for ~450 words max for bullet content)
4. Uses strong action verbs and quantified results
5. Places the most relevant experience first in each section
6. For addressable gaps, frame adjacent experience positively

Output ONLY the tailored resume content in Markdown format. No commentary.`;
}
