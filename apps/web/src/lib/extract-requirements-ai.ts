import { createTrackedMessage } from "@/lib/anthropic";

interface AIExtractedRequirements {
  hard_requirements: string[];
  preferred: string[];
  red_flags: string[];
}

// Role-title keyword → implied requirements (last-resort fallback when
// email text has no actual job description content)
const ROLE_REQUIREMENT_MAP: [RegExp, string[]][] = [
  [/\b(?:chief|c[a-z]o|cto|cio|ciso|cdo|cao)\b/i, [
    "15+ years experience in relevant domain",
    "Executive leadership and organizational strategy",
    "P&L or budget ownership at scale",
    "Board and investor communication",
    "Cross-functional team leadership across multiple departments",
    "Vendor and partner relationship management",
    "Technology vision and roadmap at enterprise scale",
  ]],
  [/\b(?:vp|vice president|svp|evp)\b/i, [
    "10+ years experience in relevant domain",
    "Executive leadership and strategic planning",
    "P&L or budget ownership",
    "Cross-functional team leadership",
    "Board or C-suite stakeholder communication",
  ]],
  [/\b(?:director|head of|senior director)\b/i, [
    "8+ years experience in relevant domain",
    "Team leadership and people management",
    "Strategic planning and roadmap ownership",
    "Cross-functional collaboration",
    "Budget and resource management",
  ]],
  [/\b(?:senior manager|engineering manager)\b/i, [
    "5+ years experience in relevant domain",
    "Team leadership and mentoring",
    "Project planning and execution",
    "Stakeholder management",
  ]],
  [/\bengineer/i, [
    "Software engineering experience",
    "System design and architecture",
    "CI/CD and DevOps practices",
  ]],
  [/\b(?:ai|machine learning|ml|data science)\b/i, [
    "AI/ML model development and deployment",
    "Python and ML frameworks (TensorFlow, PyTorch)",
    "Data pipeline architecture",
  ]],
  [/\b(?:healthcare|health|clinical|medical|life sciences)\b/i, [
    "Healthcare industry experience",
    "HIPAA compliance knowledge",
    "Healthcare IT systems (HL7, FHIR, EHR/EMR)",
  ]],
  [/\b(?:platform|infrastructure|cloud|devops)\b/i, [
    "Cloud architecture (AWS, Azure, or GCP)",
    "Scalable distributed systems",
    "Infrastructure automation and DevOps",
  ]],
  [/\b(?:product|transformation|innovation|digital)\b/i, [
    "Product strategy and roadmap development",
    "Agile methodology and delivery",
    "Stakeholder alignment and prioritization",
  ]],
];

/**
 * Generate synthetic requirements from a role title when no description exists.
 * Free (no AI call), deterministic, and always returns something scoreable.
 */
export function requirementsFromRoleTitle(role: string): string[] {
  const reqs = new Set<string>();

  for (const [pattern, implied] of ROLE_REQUIREMENT_MAP) {
    if (pattern.test(role)) {
      for (const r of implied) reqs.add(r);
    }
  }

  // Always include the role title itself as a requirement
  if (reqs.size === 0) {
    reqs.add(`Experience relevant to ${role}`);
  }

  return Array.from(reqs);
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
