/**
 * Extract structured requirements from a job description.
 * Ported from job_score.py extract_requirements()
 */

export interface ExtractedRequirements {
  hard_requirements: string[];
  preferred: string[];
  responsibilities: string[];
  keywords: string[];
  red_flags: string[];
}

const CUTOFF_PATTERNS = [
  /^Apply\s+(?:for this position|Now|Today)/i,
  /^Submit\s+Application/i,
  /^(?:Required|Optional)\s*\*/i,
  /^\*\s*First Name/i,
  /^First Name\s*$/i,
  /^Human Check/i,
  /^Voluntary Self-Identification/i,
  /^Invitation for Job Applicants to Self-Identify/i,
  /^PUBLIC BURDEN STATEMENT/i,
  /^The following questions are entirely optional/i,
];

const EEO_PATTERNS = [
  /(?:is an? )?Equal (?:Employment )?Opportunity (?:Employer|and Affirmative Action)[\s\S]*?(?:\n\n|$)/gi,
  /Unfortunately,[\s\S]*?(?:not currently hiring|Territories)\./gi,
];

export function stripApplicationForm(text: string): string {
  const lines = text.split("\n");
  let cutoffIdx = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const stripped = lines[i].trim();
    if (CUTOFF_PATTERNS.some((p) => p.test(stripped))) {
      cutoffIdx = i;
      break;
    }
  }

  let cleaned = lines.slice(0, cutoffIdx).join("\n");
  for (const pattern of EEO_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }
  return cleaned.trim();
}

const SECTION_PATTERNS: Record<string, RegExp> = {
  requirements:
    /(?:requirements?|qualifications?|what you.?(?:ll)?\s*need|must have|minimum|experience|education|skills?\s+(?:and|&)\s+(?:knowledge|skills)|specialized knowledge|technical skills|what (?:we|you).+(?:look|need)|who you are)/i,
  preferred:
    /(?:preferred|nice to have|bonus|desired|plus|ideally|good to have|additional|differenti)/i,
  responsibilities:
    /(?:responsibilities|what you.?(?:ll)?\s*do|duties|role|about the (?:role|position)|key (?:areas|functions)|you will|your (?:impact|mission|role))/i,
};

const SKIP_INDICATORS = [
  /(?:no special physical demands|travel up to|office environment)/i,
  /(?:-- No answer|background check|drug screen|e-verify)/i,
  /(?:salary|compensation|benefits|401|pto|paid time)/i,
  /(?:equal (?:employment )?opportunity|affirmative action)/i,
  /(?:visa sponsorship|legally eligible)/i,
];

const REQ_INDICATORS = [
  /\d+\+?\s*years?/i,
  /(?:must|required|minimum)/i,
  /(?:degree|bachelor|master|phd)/i,
  /(?:experience (?:with|in|leading|building|managing|developing|driving))/i,
  /(?:proficiency in|expertise in|deep expertise|proven)/i,
  /(?:certification|certified)/i,
  /(?:track record|demonstrated|strong (?:strategic|technical|communication))/i,
  /(?:knowledge of|ability to|skilled in|familiarity with)/i,
];

const PREF_INDICATORS = [
  /(?:preferred|nice to have|plus|bonus|ideally|advantageous)/i,
  /(?:familiarity with|exposure to|knowledge of)/i,
];

export function isRequirement(text: string): boolean {
  if (SKIP_INDICATORS.some((p) => p.test(text))) return false;
  return REQ_INDICATORS.some((p) => p.test(text));
}

function isPreferred(text: string): boolean {
  return PREF_INDICATORS.some((p) => p.test(text));
}

export function extractRequirements(
  jobDescription: string
): ExtractedRequirements {
  if (!jobDescription) {
    return {
      hard_requirements: [],
      preferred: [],
      responsibilities: [],
      keywords: [],
      red_flags: [],
    };
  }

  const cleanedDescription = stripApplicationForm(jobDescription);
  const lines = cleanedDescription.split("\n");

  const hard_requirements: string[] = [];
  const preferred: string[] = [];
  const responsibilities: string[] = [];

  let currentSection: string | null = null;

  for (const line of lines) {
    const stripped = line.trim();
    if (!stripped) continue;

    const lower = stripped.toLowerCase();
    const isBullet = /^[-•*]\s/.test(stripped) || /^\d+[.)]\s/.test(stripped);

    // Detect section headers (only non-bullet lines)
    if (!isBullet) {
      for (const [section, pattern] of Object.entries(SECTION_PATTERNS)) {
        if (pattern.test(lower) && stripped.length < 80) {
          currentSection = section;
          break;
        }
      }
    }

    // Extract bullet points
    let bulletMatch =
      stripped.match(/^[-•*]\s*(.+)$/) ||
      stripped.match(/^\d+[.)]\s*(.+)$/);

    if (bulletMatch) {
      const item = bulletMatch[1].trim();
      if (currentSection === "requirements") {
        hard_requirements.push(item);
      } else if (currentSection === "preferred") {
        preferred.push(item);
      } else if (currentSection === "responsibilities") {
        responsibilities.push(item);
      } else if (isRequirement(item)) {
        hard_requirements.push(item);
      } else if (isPreferred(item)) {
        preferred.push(item);
      } else {
        responsibilities.push(item);
      }
    } else if (
      currentSection === "requirements" &&
      stripped.length > 15 &&
      stripped.length < 200
    ) {
      if (!/^(?:Travel|Note|Image|About|Share)\b/.test(stripped)) {
        hard_requirements.push(stripped);
      }
    } else if (
      currentSection === "preferred" &&
      stripped.length > 15 &&
      stripped.length < 200
    ) {
      if (!/^(?:Travel|Note|Image|About|Share)\b/.test(stripped)) {
        preferred.push(stripped);
      }
    }
  }

  const keywords = extractKeywords(jobDescription);
  const red_flags = detectRedFlags(cleanedDescription);

  return { hard_requirements, preferred, responsibilities, keywords, red_flags };
}

const KEYWORD_PATTERNS = [
  /\b(?:Python|Java|JavaScript|TypeScript|Go|Rust|C\+\+|Ruby|Scala|Kotlin)\b/gi,
  /\b(?:AWS|Azure|GCP|Google Cloud|Kubernetes|Docker|Terraform)\b/gi,
  /\b(?:React|Angular|Vue|Next\.js|Node\.js|FastAPI|Django|Flask|Spring)\b/gi,
  /\b(?:PostgreSQL|MySQL|MongoDB|Redis|DynamoDB|Elasticsearch)\b/gi,
  /\b(?:CI\/CD|DevOps|Agile|Scrum|Kanban)\b/gi,
  /\b(?:HL7|FHIR|DICOM|HIPAA|SOC2|HITRUST|EHR|EMR)\b/gi,
  /\b(?:PHI|PII|FDA|CMS|ICD-10)\b/gi,
  /\b(?:AI|ML|NLP|LLM|GPT|machine learning|deep learning|neural network)\b/gi,
  /\b(?:TensorFlow|PyTorch|scikit-learn|LangChain)\b/gi,
  /\b(?:microservices|scalability|architecture|system design)\b/gi,
  /\b(?:team building|mentoring|roadmap|OKR|KPI)\b/gi,
];

export function extractKeywords(text: string): string[] {
  const keywords = new Set<string>();
  for (const pattern of KEYWORD_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern.source, pattern.flags));
    for (const m of matches) {
      keywords.add(m[0].trim());
    }
  }
  return Array.from(keywords);
}

const RED_FLAG_PATTERNS: [RegExp, string][] = [
  [/wear many hats/i, "Vague role scope — 'wear many hats'"],
  [/fast[- ]paced/i, "Fast-paced environment (potential burnout signal)"],
  [
    /must be willing to work (?:nights|weekends|overtime)/i,
    "Expects overtime",
  ],
  [
    /(?:ninja|rockstar|guru|wizard|unicorn)/i,
    "Buzzword-heavy role description",
  ],
  [
    /unlimited (?:pto|vacation)/i,
    "Unlimited PTO (often means less PTO taken)",
  ],
  [/competitive salary/i, "No salary range listed — 'competitive salary'"],
];

export function detectRedFlags(text: string): string[] {
  const flags: string[] = [];

  for (const [pattern, flag] of RED_FLAG_PATTERNS) {
    if (pattern.test(text)) {
      flags.push(flag);
    }
  }

  const yearsMatches = text.match(/(\d+)\+?\s*years?/gi);
  if (yearsMatches) {
    const maxYears = Math.max(
      ...yearsMatches.map((m) => parseInt(m.match(/\d+/)![0]))
    );
    if (maxYears > 15) {
      flags.push(`Requires ${maxYears}+ years — unusually high`);
    }
  }

  return flags;
}
