/**
 * Archetype classifier — TypeScript mirror of packages/scoring-rules/classify_archetype.py
 *
 * Heuristic routing of job descriptions to role archetypes. Rules live in
 * packages/scoring-rules/archetypes.yaml. When you change one, change both.
 */

export type ArchetypeName =
  | "engineering-leadership"
  | "ai-applied"
  | "data-analytics"
  | "platform-sre"
  | "founder-minded-ic"
  | "security"
  | "healthcare-ops"
  | "general";

export interface ArchetypeRules {
  label: string;
  description?: string;
  strictness: number;
  priority?: number;
  title_patterns: string[];
  required_keywords: string[];
  disqualifiers: string[];
}

export interface ArchetypeConfig {
  version: number;
  min_confidence: number;
  archetypes: Record<Exclude<ArchetypeName, "general">, ArchetypeRules>;
  fallback: { label: string; strictness: number };
}

export interface Classification {
  archetype: ArchetypeName;
  label: string;
  confidence: number;
  strictness: number;
  matched_signals: string[];
}

/**
 * Hardcoded mirror of archetypes.yaml. A build step (future) will generate this
 * from the YAML. Today, keep it in manual sync — check with doctor.py's
 * scoring-sync check and tests/scoring/classify-archetype.test.ts.
 */
export const ARCHETYPE_CONFIG: ArchetypeConfig = {
  version: 1,
  min_confidence: 0.6,
  archetypes: {
    "engineering-leadership": {
      label: "Engineering Leadership",
      strictness: 1.0,
      title_patterns: [
        "^(?:vp|svp|head of|director)\\b",
        "\\bdirector[,\\s]+(?:software|engineering|platform|product)\\b",
        "\\b(?:engineering manager|em|sr\\.?\\s+manager)\\b",
        "\\bhead of (?:engineering|platform|product engineering)\\b",
        "\\b(?:cto|chief technology officer)\\b",
        "\\bsr\\.?\\s+director\\b",
      ],
      required_keywords: [
        "\\b(?:team|org|people|direct reports|managers?|leadership)\\b",
      ],
      disqualifiers: ["\\bindividual contributor only\\b"],
    },
    "ai-applied": {
      label: "Applied AI / ML Engineering",
      strictness: 1.0,
      title_patterns: [
        "\\b(?:ai engineer|ml engineer|applied (?:ai|ml)|llm engineer)\\b",
        "\\b(?:head of|director of|principal|staff) (?:ai|ml|applied ai)\\b",
        "\\bai (?:platform|product|infrastructure)\\b",
        "\\bagent(ic)? (?:engineer|developer)\\b",
      ],
      required_keywords: [
        "\\b(?:llm|gpt|claude|langchain|openai|anthropic|rag|retrieval|embeddings?|vector|fine[- ]?tun|prompt)\\b",
      ],
      disqualifiers: [
        "\\bresearch scientist\\b",
        "\\bphd\\s+(?:required|mandatory)\\b",
      ],
    },
    "data-analytics": {
      label: "Data / Analytics Engineering",
      strictness: 1.0,
      title_patterns: [
        "\\b(?:senior|staff|principal|lead) data engineer\\b",
        "\\banalytics engineer\\b",
        "\\bhead of (?:data|analytics|bi)\\b",
        "\\bdata platform (?:engineer|lead)\\b",
      ],
      required_keywords: [
        "\\b(?:dbt|snowflake|bigquery|redshift|airflow|spark|warehouse|etl|elt)\\b",
      ],
      disqualifiers: [],
    },
    "platform-sre": {
      label: "Platform / SRE / Infrastructure",
      strictness: 1.0,
      title_patterns: [
        "\\b(?:senior|staff|principal) (?:platform|infrastructure|sre|site reliability|devops) engineer\\b",
        "\\bhead of (?:platform|infrastructure|sre|devex)\\b",
        "\\bplatform (?:engineer|lead)\\b",
      ],
      required_keywords: [
        "\\b(?:kubernetes|terraform|aws|gcp|observability|reliability|slo|on[- ]call)\\b",
      ],
      disqualifiers: [],
    },
    "founder-minded-ic": {
      label: "Founder-minded IC",
      strictness: 0.9,
      priority: 10,
      title_patterns: [
        "\\bfounding (?:engineer|ai engineer|platform engineer|swe)\\b",
        "\\b(?:first|early) engineer\\b",
        "\\b0[- ]to[- ]1\\b",
      ],
      required_keywords: [
        "\\b(?:founding|early stage|seed|series a|0[- ]to[- ]1|first\\s+hire|small team)\\b",
      ],
      disqualifiers: [],
    },
    security: {
      label: "Security Engineering",
      strictness: 1.0,
      title_patterns: [
        "\\b(?:senior|staff|principal) (?:security|appsec) engineer\\b",
        "\\bhead of (?:security|product security|appsec)\\b",
        "\\bciso\\b",
      ],
      required_keywords: [
        "\\b(?:owasp|threat model|siem|pentest|vulnerability|ciso|soc\\s?2|iso\\s?27001)\\b",
      ],
      disqualifiers: [],
    },
    "healthcare-ops": {
      label: "Healthcare / Regulated Ops",
      strictness: 1.0,
      priority: 10,
      title_patterns: [
        "\\b(?:cto|vp engineering|head of engineering)\\b",
      ],
      required_keywords: [
        "\\b(?:hipaa|phi|fhir|hl7|ehr|emr|hitrust|fda|cms)\\b",
      ],
      disqualifiers: [],
    },
  },
  fallback: { label: "General", strictness: 1.0 },
};

function scoreArchetype(
  rules: ArchetypeRules,
  title: string,
  jd: string
): { score: number; signals: string[] } {
  const signals: string[] = [];
  let hits = 0;
  let totalWeight = 0;

  if (rules.title_patterns.length) {
    totalWeight += 0.5;
    for (const p of rules.title_patterns) {
      if (new RegExp(p, "i").test(title)) {
        hits += 0.5;
        signals.push(`title:${p.slice(0, 40)}`);
        break;
      }
    }
  }

  if (rules.required_keywords.length) {
    totalWeight += 0.4;
    for (const p of rules.required_keywords) {
      if (new RegExp(p, "i").test(jd)) {
        hits += 0.4;
        signals.push(`keyword:${p.slice(0, 40)}`);
        break;
      }
    }
  }

  for (const p of rules.disqualifiers) {
    const rx = new RegExp(p, "i");
    if (rx.test(jd) || rx.test(title)) {
      return { score: 0, signals: [`disqualified:${p.slice(0, 40)}`] };
    }
  }

  if (totalWeight === 0) return { score: 0, signals };
  return { score: hits / totalWeight, signals };
}

export function classifyArchetype(
  title: string,
  jdText = "",
  hints: string[] = [],
  config: ArchetypeConfig = ARCHETYPE_CONFIG
): Classification {
  const safeTitle = title || "";
  const safeJd = jdText || "";
  const hintSet = new Set(hints);
  const candidates: Array<{
    name: ArchetypeName;
    score: number;
    signals: string[];
  }> = [];

  for (const [name, rules] of Object.entries(config.archetypes)) {
    const result = scoreArchetype(rules, safeTitle, safeJd);
    if (hintSet.has(name) && result.score > 0) {
      result.score = Math.min(1, result.score + 0.15);
      result.signals.push(`hint:${name}`);
    }
    candidates.push({
      name: name as ArchetypeName,
      score: result.score,
      signals: result.signals,
    });
  }

  // Sort by (score DESC, priority DESC) — niche archetypes beat generic on ties.
  const priorityOf = (name: ArchetypeName): number => {
    const rules = (config.archetypes as Record<string, ArchetypeRules | undefined>)[name];
    return rules?.priority ?? 0;
  };
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return priorityOf(b.name) - priorityOf(a.name);
  });
  const best = candidates[0];

  if (best.score < config.min_confidence) {
    return {
      archetype: "general",
      label: config.fallback.label,
      confidence: Number(best.score.toFixed(3)),
      strictness: config.fallback.strictness,
      matched_signals: best.signals,
    };
  }

  const rules = config.archetypes[best.name as Exclude<ArchetypeName, "general">];
  return {
    archetype: best.name,
    label: rules.label,
    confidence: Number(best.score.toFixed(3)),
    strictness: rules.strictness,
    matched_signals: best.signals,
  };
}

/**
 * Given raw match_pct (0-1) and gap count, return the score band adjusted by
 * archetype strictness. Mirrors apply_archetype_to_bands() in Python.
 */
export function applyArchetypeToBands(
  matchPct: number,
  gapCount: number,
  strictness: number
): "strong" | "good" | "stretch" | "long_shot" {
  // Round to 4 decimals to dodge float-precision (0.8 * 1.1 = 0.8800000000000001).
  const strongT = Number((0.8 * strictness).toFixed(4));
  const goodT = Number((0.6 * strictness).toFixed(4));
  const stretchT = Number((0.4 * strictness).toFixed(4));

  if (matchPct >= strongT && gapCount === 0) return "strong";
  if (matchPct >= goodT && gapCount <= 1) return "good";
  if (matchPct >= stretchT && gapCount <= 2) return "stretch";
  return "long_shot";
}
