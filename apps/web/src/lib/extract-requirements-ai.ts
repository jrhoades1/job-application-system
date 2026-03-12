import { createTrackedMessage } from "@/lib/anthropic";

interface AIExtractedRequirements {
  hard_requirements: string[];
  preferred: string[];
  red_flags: string[];
}

/**
 * Use Haiku to extract structured requirements from unstructured email text
 * (job alert notifications, forwarded postings, etc.) where regex extraction
 * finds nothing because the text lacks standard section headers and bullet points.
 */
export async function extractRequirementsWithAI(
  emailText: string,
  role: string,
  company: string
): Promise<AIExtractedRequirements> {
  const truncated = emailText.slice(0, 6000);

  const response = await createTrackedMessage(
    {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: `Extract the job requirements from this email about a "${role}" position at "${company}".

Return a JSON object with:
- "hard_requirements": array of specific skills, experience, or qualifications required
- "preferred": array of nice-to-have qualifications
- "red_flags": array of any concerning signals (unrealistic expectations, vague scope, etc.)

Infer requirements from context even if not explicitly listed as bullets. For example, if the role mentions "leading a team of 10 engineers", that implies "engineering management experience" as a requirement.

Email text:
${truncated}

Return ONLY a JSON object, no other text. If you can't extract any requirements, return:
{"hard_requirements": [], "preferred": [], "red_flags": []}`,
        },
      ],
    },
    "email_requirement_extraction"
  );

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { hard_requirements: [], preferred: [], red_flags: [] };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      hard_requirements: Array.isArray(parsed.hard_requirements)
        ? parsed.hard_requirements.filter(
            (r: unknown) => typeof r === "string" && r.length > 0
          )
        : [],
      preferred: Array.isArray(parsed.preferred)
        ? parsed.preferred.filter(
            (r: unknown) => typeof r === "string" && r.length > 0
          )
        : [],
      red_flags: Array.isArray(parsed.red_flags)
        ? parsed.red_flags.filter(
            (r: unknown) => typeof r === "string" && r.length > 0
          )
        : [],
    };
  } catch {
    return { hard_requirements: [], preferred: [], red_flags: [] };
  }
}
