/**
 * ATS Keyword Checker
 *
 * Extracts exact keywords/phrases from a job description and checks
 * whether each appears literally in the resume text. ATS systems do
 * string matching, not semantic understanding — so "cloud infrastructure"
 * does NOT satisfy a requirement for "AWS".
 *
 * Returns a checklist of hits and misses for pre-submit review.
 */

export interface AtsKeywordResult {
  /** Keyword/phrase extracted from the JD */
  keyword: string;
  /** Whether the exact term appears in the resume */
  found: boolean;
  /** Category: "skill", "tool", "certification", "methodology", "domain" */
  category: string;
}

export interface AtsCheckResult {
  /** 0-100 — percentage of JD keywords found literally in resume */
  ats_score: number;
  /** Total keywords extracted from JD */
  total: number;
  /** Count found in resume */
  found_count: number;
  /** Count missing from resume */
  missing_count: number;
  /** Full checklist */
  keywords: AtsKeywordResult[];
  /** Just the missing ones for quick display */
  missing: string[];
}

// --- Keyword extraction patterns grouped by category ---

const SKILL_PATTERNS: [RegExp, string][] = [
  // Programming languages
  [/\bPython\b/gi, "skill"],
  [/\bJava\b(?!Script)/gi, "skill"],
  [/\bJavaScript\b/gi, "skill"],
  [/\bTypeScript\b/gi, "skill"],
  [/\bC#\b/gi, "skill"],
  [/\bC\+\+\b/gi, "skill"],
  [/\bGo(?:lang)?\b/gi, "skill"],
  [/\bRust\b/gi, "skill"],
  [/\bRuby\b/gi, "skill"],
  [/\bScala\b/gi, "skill"],
  [/\bKotlin\b/gi, "skill"],
  [/\bR\b(?=\s*[,;]|\s+(?:programming|language|and\s))/g, "skill"],
  [/\bSQL\b/gi, "skill"],
  [/\bNode\.?js\b/gi, "skill"],

  // AI/ML frameworks & tools
  [/\bTensorFlow\b/gi, "tool"],
  [/\bPyTorch\b/gi, "tool"],
  [/\bscikit-learn\b/gi, "tool"],
  [/\bKeras\b/gi, "tool"],
  [/\bLangChain\b/gi, "tool"],
  [/\bHugging\s*Face\b/gi, "tool"],
  [/\bOpenAI\b/gi, "tool"],
  [/\bJupyter\b/gi, "tool"],
  [/\bApache Spark\b/gi, "tool"],
  [/\bHadoop\b/gi, "tool"],
  [/\bSageMaker\b/gi, "tool"],
  [/\bAzure Machine Learning\b/gi, "tool"],
  [/\bGoogle Cloud AI Platform\b/gi, "tool"],
  [/\bMLflow\b/gi, "tool"],

  // Cloud platforms
  [/\bAWS\b/g, "tool"],
  [/\bAzure\b/gi, "tool"],
  [/\bGCP\b/g, "tool"],
  [/\bGoogle Cloud\b/gi, "tool"],
  [/\bKubernetes\b/gi, "tool"],
  [/\bDocker\b/gi, "tool"],
  [/\bTerraform\b/gi, "tool"],
  [/\bServerless\b/gi, "tool"],

  // Databases
  [/\bPostgreSQL\b/gi, "tool"],
  [/\bMySQL\b/gi, "tool"],
  [/\bMongoDB\b/gi, "tool"],
  [/\bRedis\b/gi, "tool"],
  [/\bDynamoDB\b/gi, "tool"],
  [/\bElasticsearch\b/gi, "tool"],
  [/\bSQL Server\b/gi, "tool"],
  [/\bOracle\b/gi, "tool"],
  [/\bSnowflake\b/gi, "tool"],

  // Frameworks
  [/\bReact\b/gi, "tool"],
  [/\bAngular\b/gi, "tool"],
  [/\bVue\b/gi, "tool"],
  [/\bNext\.?js\b/gi, "tool"],
  [/\bDjango\b/gi, "tool"],
  [/\bFlask\b/gi, "tool"],
  [/\bFastAPI\b/gi, "tool"],
  [/\bSpring\b/gi, "tool"],

  // Methodologies
  [/\bAgile\b/gi, "methodology"],
  [/\bScrum\b/gi, "methodology"],
  [/\bKanban\b/gi, "methodology"],
  [/\bCI\/CD\b/gi, "methodology"],
  [/\bDevOps\b/gi, "methodology"],
  [/\bmicroservices\b/gi, "methodology"],
  [/\bAPI\b/g, "methodology"],
  [/\bREST(?:ful)?\b/gi, "methodology"],
  [/\bGraphQL\b/gi, "methodology"],
  [/\bETL\b/g, "methodology"],

  // Healthcare / compliance
  [/\bHL7\b/g, "domain"],
  [/\bFHIR\b/g, "domain"],
  [/\bDICOM\b/g, "domain"],
  [/\bHIPAA\b/g, "certification"],
  [/\bSOC\s*2\b/gi, "certification"],
  [/\bHITRUST\b/gi, "certification"],
  [/\bEHR\b/g, "domain"],
  [/\bEMR\b/g, "domain"],
  [/\bEpic\b/g, "domain"],
  [/\bclaims processing\b/gi, "domain"],
  [/\bvalue[- ]based care\b/gi, "domain"],

  // AI/ML concepts
  [/\bAI\b/g, "skill"],
  [/\bML\b/g, "skill"],
  [/\bmachine learning\b/gi, "skill"],
  [/\bdeep learning\b/gi, "skill"],
  [/\bNLP\b/g, "skill"],
  [/\bLLM\b/g, "skill"],
  [/\bpredictive analytics\b/gi, "skill"],
  [/\bdata governance\b/gi, "skill"],
  [/\bdata warehousing\b/gi, "skill"],
  [/\bdata lake\b/gi, "skill"],
  [/\bdata science\b/gi, "skill"],

  // Leadership / management
  [/\bchange management\b/gi, "methodology"],
  [/\bstakeholder management\b/gi, "methodology"],
  [/\bOKR\b/g, "methodology"],
  [/\bKPI\b/g, "methodology"],
  [/\broadmap\b/gi, "methodology"],
  [/\bcross-functional\b/gi, "methodology"],
];

/**
 * Extract ATS-relevant keywords from a job description.
 * Returns deduplicated list with categories.
 */
export function extractAtsKeywords(jobDescription: string): { keyword: string; category: string }[] {
  const seen = new Map<string, string>(); // lowercase → { keyword, category }

  for (const [pattern, category] of SKILL_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(jobDescription)) !== null) {
      const kw = match[0].trim();
      const lower = kw.toLowerCase();
      // Keep first occurrence's casing
      if (!seen.has(lower)) {
        seen.set(lower, category);
      }
    }
  }

  // Also extract multi-word phrases from requirements sections that look like skills
  // e.g., "experience with data lakes" → "data lakes"
  const phrasePatterns = [
    /(?:experience with|proficiency in|knowledge of|expertise in|familiar(?:ity)? with)\s+([A-Z][A-Za-z\s/]+?)(?:[,.]|\s+and\s|\s+or\s|$)/gi,
  ];

  for (const pp of phrasePatterns) {
    let match;
    while ((match = pp.exec(jobDescription)) !== null) {
      const phrase = match[1].trim();
      // Only add multi-word phrases (2-4 words) that aren't already captured
      const words = phrase.split(/\s+/);
      if (words.length >= 2 && words.length <= 4 && phrase.length < 40) {
        const lower = phrase.toLowerCase();
        if (!seen.has(lower)) {
          seen.set(lower, "skill");
        }
      }
    }
  }

  const results: { keyword: string; category: string }[] = [];
  for (const [keyword, category] of seen) {
    results.push({ keyword, category });
  }

  return results;
}

/**
 * Check which JD keywords appear literally in the resume text.
 * This simulates ATS keyword matching — no semantic understanding.
 */
export function checkAtsKeywords(
  resumeText: string,
  jobDescription: string
): AtsCheckResult {
  const jdKeywords = extractAtsKeywords(jobDescription);

  if (jdKeywords.length === 0) {
    return {
      ats_score: 100,
      total: 0,
      found_count: 0,
      missing_count: 0,
      keywords: [],
      missing: [],
    };
  }

  const resumeLower = resumeText.toLowerCase();
  const keywords: AtsKeywordResult[] = [];
  const missing: string[] = [];
  let foundCount = 0;

  for (const { keyword, category } of jdKeywords) {
    // Check for literal presence (case-insensitive)
    const found = resumeLower.includes(keyword.toLowerCase());
    keywords.push({ keyword, found, category });
    if (found) {
      foundCount++;
    } else {
      missing.push(keyword);
    }
  }

  // Sort: missing first, then by category
  keywords.sort((a, b) => {
    if (a.found !== b.found) return a.found ? 1 : -1;
    return a.category.localeCompare(b.category);
  });

  const atsScore = jdKeywords.length > 0
    ? Math.round((foundCount / jdKeywords.length) * 1000) / 10
    : 100;

  return {
    ats_score: atsScore,
    total: jdKeywords.length,
    found_count: foundCount,
    missing_count: jdKeywords.length - foundCount,
    keywords,
    missing,
  };
}
