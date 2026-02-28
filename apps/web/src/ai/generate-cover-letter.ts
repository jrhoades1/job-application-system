/**
 * AI cover letter generation prompt template.
 * Based on cover-letter-writer skill from job-application-system.
 *
 * Structure: 3-4 paragraphs
 * - Opening: Role interest + company-specific hook
 * - Body: 2-3 strongest matches with quantified evidence
 * - Gap framing: Positively address addressable gaps
 * - Closing: Forward-looking interest and call to action
 */

export interface CoverLetterInput {
  company: string;
  role: string;
  jobDescription: string;
  strongMatches: string[];
  gaps: string[];
  addressableGaps: string[];
  achievements: string;
  narrative: string;
  candidateName: string;
}

export function buildCoverLetterPrompt(input: CoverLetterInput): string {
  return `You are an expert cover letter writer. Write a compelling, targeted cover letter.

## Target
**Company:** ${input.company}
**Role:** ${input.role}
**Candidate:** ${input.candidateName}

## Job Description (key excerpts)
${input.jobDescription.slice(0, 4000)}

## Candidate's Strongest Matches
${input.strongMatches.map((m) => `- ${m}`).join("\n") || "None identified"}

## Gaps
${input.gaps.map((g) => `- ${g}`).join("\n") || "None"}

## Addressable Gaps (frame positively)
${input.addressableGaps.map((g) => `- ${g}`).join("\n") || "None"}

## Career Narrative
${input.narrative || "Not provided"}

## Key Achievements
${input.achievements.slice(0, 3000)}

## Cover Letter Requirements

**Structure:** 3-4 paragraphs
1. **Opening**: Express specific interest in this role at this company. Reference something company-specific — not generic praise that could apply to any company.
2. **Body** (1-2 paragraphs): Highlight 2-3 strongest matches with quantified evidence. Connect achievements directly to the role's requirements.
3. **Gap Framing** (if needed): Frame addressable gaps positively as adjacent expertise or growth areas. Example: "My multi-cloud experience with AWS positions me to adopt GCP rapidly" — NOT "I do not have GCP experience."
4. **Closing**: Express enthusiasm, mention availability, and include a clear call to action.

**Tone Rules:**
- Formal business tone — no contractions
- Confident but not arrogant
- Specific and evidence-based, not generic
- Company-specific (the letter should clearly be written for THIS company)
- One page maximum (~300-350 words)

Output ONLY the cover letter text. No headers, no commentary, no "Dear Hiring Manager" alternatives — use "Dear Hiring Manager," as the salutation.`;
}
