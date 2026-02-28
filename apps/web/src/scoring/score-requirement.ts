/**
 * Score individual requirements against user achievements.
 * Ported from job_score.py score_requirement()
 */

export interface Achievement {
  category: string;
  items: { text: string; learned_date?: string }[];
}

export interface RequirementMatch {
  requirement: string;
  match_type: "strong" | "partial" | "gap";
  evidence: string;
  category: string;
}

function simpleStem(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ing") && word.length > 5) return word.slice(0, -3);
  if (word.endsWith("tion") && word.length > 6) return word.slice(0, -4);
  if (word.endsWith("ed") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("ment") && word.length > 6) return word.slice(0, -4);
  if (word.endsWith("ness") && word.length > 6) return word.slice(0, -4);
  if (word.endsWith("ies") && word.length > 4)
    return word.slice(0, -3) + "y";
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 4)
    return word.slice(0, -1);
  return word;
}

const DIRECT_KEYWORD_RE =
  /\b(?:Python|Java|AWS|Azure|GCP|Kubernetes|Docker|Terraform|React|Node|HIPAA|SOC2|FHIR|HL7|DICOM|AI|ML|NLP|microservices|agile|scrum|DevOps|CI\/CD)\b/gi;

/**
 * Score a single requirement against the achievements inventory.
 * Accepts either structured achievements (from DB) or flat map (for compat).
 */
export function scoreRequirement(
  requirement: string,
  achievements: Achievement[] | Record<string, string[]>
): RequirementMatch {
  const reqLower = requirement.toLowerCase();
  const reqWords = reqLower.match(/\b[a-z]{3,}\b/g) || [];
  const reqTerms = new Set(reqWords.map(simpleStem));

  let bestMatch: { evidence: string; category: string } | null = null;
  let bestScore = 0;

  // Normalize achievements to flat iterator
  const entries: [string, string[]][] = Array.isArray(achievements)
    ? achievements.map((a) => [a.category, a.items.map((i) => i.text)])
    : Object.entries(achievements);

  for (const [category, items] of entries) {
    for (const item of items) {
      const itemLower = item.toLowerCase();
      const itemWords = itemLower.match(/\b[a-z]{3,}\b/g) || [];
      const itemTerms = new Set(itemWords.map(simpleStem));

      let overlap = 0;
      if (reqTerms.size > 0 && itemTerms.size > 0) {
        let intersectionCount = 0;
        for (const t of reqTerms) {
          if (itemTerms.has(t)) intersectionCount++;
        }
        overlap = intersectionCount / Math.max(reqTerms.size, 1);
      }

      // Direct keyword boost
      const directKeywords = requirement.match(DIRECT_KEYWORD_RE) || [];
      for (const kw of directKeywords) {
        if (itemLower.includes(kw.toLowerCase())) {
          overlap += 0.3;
        }
      }

      // Experience level match
      const yearsReq = reqLower.match(/(\d+)\+?\s*years?/);
      const yearsAch = itemLower.match(/(\d+)\+?\s*years?/);
      if (yearsReq && yearsAch) {
        if (parseInt(yearsAch[1]) >= parseInt(yearsReq[1])) {
          overlap += 0.2;
        }
      }

      if (overlap > bestScore) {
        bestScore = overlap;
        bestMatch = { evidence: item, category };
      }
    }
  }

  if (bestScore >= 0.35) {
    return {
      requirement,
      match_type: "strong",
      evidence: bestMatch!.evidence,
      category: bestMatch!.category,
    };
  } else if (bestScore >= 0.2) {
    return {
      requirement,
      match_type: "partial",
      evidence: bestMatch?.evidence ?? "",
      category: bestMatch?.category ?? "",
    };
  } else {
    return {
      requirement,
      match_type: "gap",
      evidence: "",
      category: "",
    };
  }
}
