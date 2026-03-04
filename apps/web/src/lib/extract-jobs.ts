import { createTrackedMessage } from "@/lib/anthropic";

export interface ExtractedJob {
  company: string;
  role: string;
  location?: string;
}

/**
 * Use Haiku to extract all jobs from a multi-job digest email body.
 * Returns array of {company, role, location?} for each job found.
 */
export async function extractJobsFromEmail(
  body: string,
  subject: string,
  platform: string | null
): Promise<ExtractedJob[]> {
  const truncatedBody = body.slice(0, 8000); // Keep prompt small for Haiku

  const response = await createTrackedMessage(
    {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `Extract ALL job listings from this ${platform ?? "job alert"} email. Return a JSON array of objects with "company", "role", and optionally "location" fields.

Subject: ${subject}

Email body:
${truncatedBody}

Return ONLY a JSON array, no other text. Example:
[{"company": "Acme Corp", "role": "Software Engineer", "location": "Remote"}]

If you cannot extract any jobs, return an empty array: []`,
        },
      ],
    },
    "email_job_extraction"
  );

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (j: Record<string, unknown>) =>
        typeof j.company === "string" &&
        j.company.length > 0 &&
        typeof j.role === "string" &&
        j.role.length > 0
    );
  } catch {
    return [];
  }
}
