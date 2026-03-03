/**
 * AI resume parsing prompt — extracts structured profile data from raw resume text.
 * Used for new user onboarding: upload resume → populate profile fields.
 */

export function buildParseResumePrompt(resumeText: string): string {
  return `You are an expert at parsing resumes into structured profile data.

Extract the candidate's information from the resume below and return a JSON object.

## Resume Text
${resumeText}

## Instructions

Return ONLY a valid JSON object with this exact structure (no commentary, no markdown fences):

{
  "full_name": "string or null",
  "email": "string or null",
  "phone": "string or null",
  "location": "string or null — city/state format preferred",
  "linkedin_url": "string or null — full URL including https://",
  "narrative": "string — 2-3 sentence career positioning statement summarizing their background, core strengths, and career focus. Write in first person if the resume uses it, otherwise third person.",
  "achievements": [
    {
      "category": "string — a logical grouping like 'Leadership', 'Technical Skills', 'Healthcare IT', 'AI/ML', 'Education', etc.",
      "items": [
        { "text": "string — a specific, concrete achievement or skill in 1-2 sentences. Quantify where possible." }
      ]
    }
  ]
}

## Achievement Extraction Rules
- Group achievements into 4-8 meaningful categories based on the candidate's background
- Each item should be a standalone achievement or skill, not a job title or date range
- Prefer specificity: "Led team of 12 engineers to deliver $3M platform migration" over "Managed engineers"
- Include education as a category with degree + institution as items
- Include certifications in a "Certifications" category if present
- Aim for 4-8 items per category
- Do NOT include objectives, job titles, or date ranges as achievement items`;
}
