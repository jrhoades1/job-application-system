/**
 * AI prompt template for answering application questions.
 * Uses full job context (JD, achievements, match scores, narrative)
 * so the user doesn't need to provide any additional context.
 *
 * Model: Sonnet — structured generation with context synthesis.
 */

export interface AnswerQuestionInput {
  company: string;
  role: string;
  jobDescription: string;
  question: string;
  strongMatches: string[];
  gaps: string[];
  addressableGaps: string[];
  achievements: string;
  narrative: string;
  candidateName: string;
  existingNotes: string;
}

export function buildAnswerQuestionPrompt(input: AnswerQuestionInput): string {
  return `You are a career coach helping a job candidate answer an application question. Write a compelling, specific answer that sounds like the candidate wrote it themselves.

## Target
**Company:** ${input.company}
**Role:** ${input.role}
**Candidate:** ${input.candidateName}

## The Question
${input.question}

## Job Description
${input.jobDescription.slice(0, 4000)}

## Candidate's Strongest Matches for This Role
${input.strongMatches.map((m) => `- ${m}`).join("\n") || "None identified yet"}

## Known Gaps
${input.gaps.map((g) => `- ${g}`).join("\n") || "None"}

## Addressable Gaps
${input.addressableGaps.map((g) => `- ${g}`).join("\n") || "None"}

## Career Narrative / Positioning
${input.narrative || "Not provided"}

## Key Achievements
${input.achievements.slice(0, 3000)}

${input.existingNotes ? `## Additional Context (candidate's notes)\n${input.existingNotes.slice(0, 1000)}` : ""}

## Answer Requirements

1. **Answer the specific question asked.** Do not give a generic response.
2. **Use the candidate's real achievements and experience** as evidence. Reference specific numbers, outcomes, and projects from the achievements list.
3. **Connect the answer to this specific company and role.** Show why the candidate is a fit for THIS job, not any job.
4. **If the question asks about a gap area**, frame it positively using adjacent experience or transferable skills. Never say "I don't have experience with X."
5. **Tone:** Confident, specific, conversational but professional. First person. No buzzwords or filler phrases.
6. **Length:** Match what the question calls for. Short questions get 2-3 sentences. "Tell us about..." or "Describe..." questions get 1-3 paragraphs. Never exceed 300 words unless the question explicitly asks for more.
7. **Never use em dashes.** Use commas, periods, or semicolons instead.

Output ONLY the answer text. No commentary, no "Here's a suggested answer:", no quotation marks wrapping the response.`;
}
