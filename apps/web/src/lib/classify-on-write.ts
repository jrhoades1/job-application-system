/**
 * classify-on-write — single helper called by every path that inserts a new
 * application or pipeline lead. Keeps archetype classification logic
 * centralized so all write sites populate the same way.
 *
 * Usage:
 *   const { archetype, archetype_confidence } = classifyForWrite({
 *     role: "Senior AI Engineer",
 *     jd: "Build LLM features...",
 *     hints: ["ai-applied"],  // optional, from portal_targets.yaml
 *   });
 *   supabase.from("applications").insert({ ..., archetype, archetype_confidence });
 */
import { classifyArchetype } from "@/scoring/classify-archetype";

export interface ClassifyForWriteInput {
  role: string | null | undefined;
  jd?: string | null;
  hints?: string[];
}

export interface ClassifyForWriteResult {
  archetype: string;
  archetype_confidence: number;
}

/**
 * Classify and return archetype fields ready to spread into a Supabase insert.
 * Returns null archetype + 0 confidence if role is missing (stays DB-safe).
 */
export function classifyForWrite(
  input: ClassifyForWriteInput
): ClassifyForWriteResult {
  const role = (input.role ?? "").trim();
  if (!role) {
    return { archetype: "general", archetype_confidence: 0 };
  }
  const result = classifyArchetype(role, input.jd ?? "", input.hints ?? []);
  return {
    archetype: result.archetype,
    archetype_confidence: result.confidence,
  };
}
