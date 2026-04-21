/**
 * POST /api/applications/[id]/gap-analysis
 *
 * For every gap already computed by POST /score, call Sonnet to assign a
 * severity (blocker | high | medium | low) and a one-sentence mitigation
 * grounded in the user's achievements.md. Writes the enriched gaps back
 * to match_scores.gaps.
 *
 * Cost: ~$0.01 per gap at Sonnet rates. 5-10 gaps per evaluation typical.
 *
 * Security: user must own the application. All Sonnet calls go through
 * createTrackedMessage which enforces the monthly spend cap.
 */
import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";
import { createTrackedMessage } from "@/lib/anthropic";
import {
  buildGapSeverityPrompt,
  parseGapSeverityResponse,
  isGroundedInInventory,
  type GapSeverityResult,
} from "@/ai/gap-severity";

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 512;

interface GapEntry {
  requirement: string;
  match_type: "gap";
  evidence?: string;
  category?: string;
  severity?: string;
  mitigation?: string;
  cited_achievements?: string[];
  no_mitigation_available?: boolean;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const { id } = await params;

    // Load application + existing match_scores + achievements
    const { data: app, error: appError } = await supabase
      .from("applications")
      .select("id, company, role, job_description, archetype")
      .eq("id", id)
      .eq("clerk_user_id", userId)
      .single();

    if (appError || !app) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const { data: score, error: scoreError } = await supabase
      .from("match_scores")
      .select("id, gaps, requirements_matched")
      .eq("application_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (scoreError || !score) {
      return NextResponse.json(
        { error: "No match score — run POST /score first" },
        { status: 400 }
      );
    }

    const gaps = (score.gaps as GapEntry[]) ?? [];
    if (gaps.length === 0) {
      return NextResponse.json({ enriched: [], skipped: "no gaps" });
    }

    // Load user's achievements (JSONB: [{category, items: [{text, learned_date}]}])
    const { data: profile } = await supabase
      .from("profiles")
      .select("achievements")
      .eq("clerk_user_id", userId)
      .maybeSingle();

    type AchievementCategory = {
      category: string;
      items: Array<{ text: string; learned_date?: string }>;
    };
    const achievementsList = (profile?.achievements ?? []) as AchievementCategory[];
    const achievementsMarkdown = achievementsList
      .map(
        (cat) =>
          `## ${cat.category}\n` +
          cat.items.map((i) => `- ${i.text}`).join("\n")
      )
      .join("\n\n");

    if (!achievementsMarkdown || achievementsMarkdown.length < 50) {
      return NextResponse.json(
        { error: "No achievements in profile — cannot ground mitigations" },
        { status: 400 }
      );
    }

    const strongMatches = (
      (score.requirements_matched as Array<{ requirement: string }>) ?? []
    ).map((m) => m.requirement);

    // Process gaps sequentially (keeps spend predictable; 5-10 calls * ~1s each)
    const enriched: GapEntry[] = [];
    const errors: Array<{ gap: string; error: string }> = [];

    for (const gap of gaps) {
      try {
        const prompt = buildGapSeverityPrompt({
          company: app.company ?? "",
          role: app.role ?? "",
          jobDescription: app.job_description ?? "",
          gap: gap.requirement,
          achievementsMarkdown,
          strongMatches,
          archetype: app.archetype ?? "general",
        });

        const response = await createTrackedMessage(
          {
            model: MODEL,
            max_tokens: MAX_TOKENS,
            messages: [{ role: "user", content: prompt }],
          },
          "gap_severity",
          id
        );

        const raw = response.content
          .filter((c) => c.type === "text")
          .map((c) => (c as { text: string }).text)
          .join("");

        const parsed: GapSeverityResult = parseGapSeverityResponse(raw);
        const grounded = isGroundedInInventory(parsed, achievementsMarkdown);

        enriched.push({
          ...gap,
          severity: parsed.severity,
          mitigation: grounded
            ? parsed.mitigation
            : `(ungrounded — review before using) ${parsed.mitigation}`,
          cited_achievements: parsed.cited_achievements,
          no_mitigation_available: parsed.no_mitigation_available,
        });
      } catch (err) {
        errors.push({
          gap: gap.requirement,
          error: err instanceof Error ? err.message : String(err),
        });
        // Fall back: keep gap as-is without severity
        enriched.push(gap);
      }
    }

    // Persist enriched gaps
    const { error: updateError } = await supabase
      .from("match_scores")
      .update({ gaps: enriched })
      .eq("id", score.id);

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to persist enriched gaps", detail: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      enriched,
      errors: errors.length ? errors : undefined,
      counts: {
        total: gaps.length,
        severity_assigned: enriched.filter((g) => g.severity).length,
        errors: errors.length,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unauthorized") || msg.includes("Clerk")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Server error", detail: msg }, { status: 500 });
  }
}
