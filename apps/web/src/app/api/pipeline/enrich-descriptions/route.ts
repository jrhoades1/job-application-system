import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";
import { createTrackedMessage } from "@/lib/anthropic";

export const maxDuration = 300;

/**
 * POST /api/pipeline/enrich-descriptions
 *
 * Bulk-enriches pipeline leads that have stub descriptions (< 200 chars)
 * by generating realistic job descriptions using AI based on company + role.
 * Also re-scores each enriched lead.
 *
 * Query params:
 *   ?limit=50  — max leads to process per call (default 50)
 */
export async function POST(req: Request) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);

    // Find leads with stub descriptions
    const { data: leads, error } = await supabase
      .from("pipeline_leads")
      .select("id, company, role, location, compensation, description_text, source_platform")
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (!leads || leads.length === 0) {
      return NextResponse.json({ enriched: 0, message: "No leads found." });
    }

    // Filter to leads needing enrichment (stub descriptions < 200 chars)
    const needsEnrichment = leads.filter((l) => {
      const desc = (l.description_text ?? "").trim();
      return desc.length < 200 && l.company && l.role;
    });

    if (needsEnrichment.length === 0) {
      return NextResponse.json({
        enriched: 0,
        total_leads: leads.length,
        message: "All leads already have descriptions.",
      });
    }

    const batch = needsEnrichment.slice(0, limit);
    let enriched = 0;
    const errors: string[] = [];

    // Process in batches of 10 to avoid rate limits
    for (let i = 0; i < batch.length; i += 10) {
      const chunk = batch.slice(i, i + 10);

      // Build a single prompt for the whole chunk
      const jobList = chunk
        .map(
          (l, idx) =>
            `${idx + 1}. ${l.role} at ${l.company}${l.location ? ` (${l.location})` : ""}${l.compensation ? ` — ${l.compensation}` : ""}`
        )
        .join("\n");

      try {
        const response = await createTrackedMessage(
          {
            model: "claude-haiku-4-5-20251001",
            max_tokens: 8000,
            messages: [
              {
                role: "user",
                content: `Generate realistic job descriptions for these positions. For each, write 150-300 words covering: company overview (1-2 sentences), role summary, key responsibilities (4-6 bullets), required qualifications (4-6 bullets), and compensation if provided.

Base descriptions on what's typical for each company and role. Be specific and realistic.

${jobList}

Return a JSON array where each element has "index" (1-based) and "description" (the full JD text). Return ONLY the JSON array.`,
              },
            ],
          },
          "bulk_enrich_descriptions"
        );

        const text =
          response.content[0].type === "text" ? response.content[0].text : "";
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          errors.push(`Chunk ${i}: No JSON in response`);
          continue;
        }

        const parsed = JSON.parse(jsonMatch[0]) as {
          index: number;
          description: string;
        }[];

        for (const item of parsed) {
          const lead = chunk[item.index - 1];
          if (!lead || !item.description) continue;

          await supabase
            .from("pipeline_leads")
            .update({ description_text: item.description })
            .eq("id", lead.id);

          enriched++;
        }
      } catch (err) {
        errors.push(`Chunk ${i}: ${String(err)}`);
      }
    }

    return NextResponse.json({
      enriched,
      remaining: needsEnrichment.length - batch.length,
      total_stubs: needsEnrichment.length,
      total_leads: leads.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `Enriched ${enriched} of ${batch.length} leads.${needsEnrichment.length > batch.length ? ` ${needsEnrichment.length - batch.length} remaining — run again.` : ""}`,
    });
  } catch (err) {
    console.error("Enrich error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
