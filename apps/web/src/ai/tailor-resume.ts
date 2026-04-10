/**
 * AI resume tailoring prompt template.
 * Based on resume-tailor skill from job-application-system.
 *
 * Intensity based on match score:
 * - Light (strong match): Minor keyword optimization, reorder bullets
 * - Moderate (good match): Emphasize relevant experience, inject keywords
 * - Heavy (stretch/long shot): Creative positioning, transferable skills focus
 */

export interface WorkHistoryEntry {
  company: string;
  title: string;
  start_date: string;
  end_date?: string | null;
  current?: boolean;
}

export interface TailorResumeInput {
  baseResume: string;
  jobDescription: string;
  company: string;
  role: string;
  matchScore: string; // "strong" | "good" | "stretch" | "long_shot"
  keywords: string[];
  atsKeywords?: string[];
  strongMatches: string[];
  gaps: string[];
  addressableGaps: string[];
  achievements: string;
  narrative: string;
  contactInfo: {
    full_name: string;
    email: string;
    phone?: string | null;
    location?: string | null;
    linkedin_url?: string | null;
    portfolio_url?: string | null;
  };
  workHistory: WorkHistoryEntry[];
}

/**
 * Convert YYYY-MM or YYYY date strings to human-readable format.
 * "2023-10" → "October 2023", "2023" → "2023", anything else passes through.
 */
function formatDate(date: string): string {
  if (!date) return "";
  const match = date.match(/^(\d{4})-(\d{2})$/);
  if (!match) return date; // already readable or just a year
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const monthIndex = parseInt(match[2], 10) - 1;
  if (monthIndex < 0 || monthIndex > 11) return date;
  return `${months[monthIndex]} ${match[1]}`;
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
- One-page format maintained
- CRITICAL: Ensure ALL ATS keywords listed below appear VERBATIM in the resume`,
    moderate: `MODERATE TAILORING:
- Reorder sections and bullets by relevance to this role
- Inject 5-10 keywords from the posting
- Expand bullets that match requirements with more specific details
- Compress less relevant experience to make room
- One-page format mandatory
- CRITICAL: Ensure ALL ATS keywords listed below appear VERBATIM in the resume`,
    heavy: `HEAVY TAILORING:
- Lead with transferable skills that map to requirements
- Reframe experience to highlight relevance to this role
- Inject 10+ keywords creatively but naturally
- Frame addressable gaps as adjacent expertise
- Compress or remove least relevant experience
- One-page format mandatory — be aggressive with compression
- CRITICAL: Ensure ALL ATS keywords listed below appear VERBATIM in the resume`,
  };

  // Build contact header — only include fields that have actual values
  const c = input.contactInfo;
  const contactParts: string[] = [];
  if (c.email) contactParts.push(`**Email:** ${c.email}`);
  if (c.phone) contactParts.push(`**Phone:** ${c.phone}`);
  if (c.location) contactParts.push(`**Location:** ${c.location}`);
  if (c.linkedin_url) contactParts.push(`**LinkedIn:** ${c.linkedin_url}`);
  if (c.portfolio_url) contactParts.push(`**Portfolio:** ${c.portfolio_url}`);
  const contactBlock = contactParts.length > 0
    ? contactParts.join(" | ")
    : "NO CONTACT INFO PROVIDED — omit the contact line entirely, do NOT generate placeholder text";

  // Build work history section
  const workHistoryText = input.workHistory.length > 0
    ? input.workHistory.map((w) => {
        const dates = w.current ? `${formatDate(w.start_date)} - Present` : `${formatDate(w.start_date)} - ${formatDate(w.end_date ?? "")}`;
        return `- **${w.title}** at ${w.company} (${dates})`;
      }).join("\n")
    : "NONE PROVIDED";

  // Extract hobbies/interests from achievements (if present)
  const hobbiesCategory = input.baseResume.match(/## Hobbies & Interests\n([\s\S]*?)(?=\n## |$)/);
  const hobbiesText = hobbiesCategory ? hobbiesCategory[1].trim() : "";

  return `You are an expert resume writer tailoring a resume for a specific job application.

## Target Role
**Company:** ${input.company}
**Role:** ${input.role}
**Match Score:** ${input.matchScore}

## Tailoring Intensity: ${intensity.toUpperCase()}
${intensityGuide[intensity]}

## Keywords to Incorporate
${input.keywords.join(", ")}

## ATS-CRITICAL KEYWORDS (must appear VERBATIM in the resume)
${input.atsKeywords && input.atsKeywords.length > 0 ? `These exact terms are extracted from the job description. ATS systems do literal string matching — they do NOT understand synonyms. Every keyword below MUST appear word-for-word somewhere in the resume (Skills section, bullets, or summary). Do not paraphrase them.

${input.atsKeywords.map((k) => `- "${k}"`).join("\n")}

Strategy: Place as many as possible in the Technical Skills / Skills section. Weave remaining ones into experience bullets where truthful. If the candidate has the skill but it wasn't in the source achievements, it's OK to add it to the Skills section.` : "None extracted."}

## Strong Matches to Emphasize
${input.strongMatches.map((m) => `- ${m}`).join("\n") || "None identified"}

## Gaps to Address
${input.gaps.map((g) => `- ${g}`).join("\n") || "None"}

## Addressable Gaps (frame positively)
${input.addressableGaps.map((g) => `- ${g}`).join("\n") || "None"}

## Career Narrative
${input.narrative || "Not provided"}

## Contact Information (use EXACTLY as provided — do NOT invent or substitute)
**Name:** ${c.full_name}
${contactBlock}

## Work History (use EXACT titles — do not change or invent)
${workHistoryText}

## Achievements & Skills
${input.baseResume}

## CRITICAL RULES — VIOLATIONS WILL MAKE THE RESUME UNUSABLE

**ACCURACY IS MANDATORY:**
- Use the candidate's EXACT name as provided above: "${c.full_name}". Never use "John Doe" or any other name.
- For contact details, copy the EXACT values above verbatim. If a field is missing, OMIT it — never write placeholder words like "Phone", "Email", "LinkedIn", or "Location".
- For job titles: use ONLY the exact titles listed in Work History. If Work History says "NONE PROVIDED", then DO NOT create a "Professional Experience" section with job titles. Instead, organize bullets under company names only (e.g., "## ilumed Healthcare" with bullets underneath, no title).
- NEVER invent, upgrade, or embellish job titles. "VP of Engineering" cannot become "Chief Technology Officer". This is a legal document.
- NEVER fabricate companies, dates, degrees, or certifications not in the source data.

## Hobbies & Interests
${hobbiesText ? `Include a brief "Hobbies & Interests" section at the end of the resume. These show personality and make the candidate human. Keep each item to one line. Here are the candidate's interests:\n${hobbiesText}` : "None provided — omit this section."}

## Resume Format Instructions

1. Start with the candidate's name as an H1 heading, followed by contact details on the next line
2. Include an Executive Summary / Professional Summary section
3. Organize experience in reverse chronological order, mapping achievement bullets to the correct company
4. Optimize for this specific role using keyword injection and bullet reordering
5. Fit on one page (aim for ~450 words max for bullet content)
6. Use strong action verbs and quantified results
7. Place the most relevant experience first within each role
8. For addressable gaps, frame adjacent experience positively
9. If Hobbies & Interests are provided, include them as a brief section at the end — they humanize the candidate and show genuine passion (especially AI/ML side projects)

Output the tailored resume content in Markdown format, then on the VERY LAST LINE output exactly:
MATCH_PERCENTAGE: <number>
where <number> is your assessment (0-100) of how well this tailored resume matches the job description. Consider keyword coverage, experience alignment, and skills fit. No other commentary.`;
}
