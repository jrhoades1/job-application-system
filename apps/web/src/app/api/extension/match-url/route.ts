import { NextResponse } from "next/server";
import { getExtensionClient } from "@/lib/extension-auth";

export async function GET(req: Request) {
  try {
    const { supabase, userId } = await getExtensionClient(req);
    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url");

    if (!url) {
      return NextResponse.json({ error: "url parameter required" }, { status: 400 });
    }

    // Try exact source_url match first
    // Return cached evaluation artifacts (cover_letter, archetype, score) so the
    // extension can offer to fill the cover-letter field without regenerating.
    const { data: exact } = await supabase
      .from("applications")
      .select("id, company, role, status, cover_letter, resume_version, archetype, match_scores(overall, match_percentage)")
      .eq("clerk_user_id", userId)
      .eq("source_url", url)
      .is("deleted_at", null)
      .maybeSingle();

    if (exact) {
      const score = Array.isArray(exact.match_scores) ? exact.match_scores[0] : exact.match_scores;
      return NextResponse.json({
        match: {
          id: exact.id,
          company: exact.company,
          role: exact.role,
          status: exact.status,
          archetype: exact.archetype,
          has_cover_letter: !!exact.cover_letter,
          cover_letter: exact.cover_letter ?? null,
          resume_version: exact.resume_version ?? null,
          score: score
            ? {
                overall: score.overall,
                match_percentage: score.match_percentage,
              }
            : null,
        },
      });
    }

    // Try partial URL match — but skip generic job board domains
    // (they'd match every application sourced from that board)
    const GENERIC_DOMAINS = [
      "linkedin.com", "indeed.com", "glassdoor.com", "ziprecruiter.com",
      "dice.com", "google.com", "monster.com", "careerbuilder.com",
      "joinhandshake.com", "swooped.co",
    ];

    let domain: string | null = null;
    try {
      domain = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      // invalid URL
    }

    if (domain && !GENERIC_DOMAINS.some((g) => domain!.endsWith(g))) {
      // For company career pages, match by full URL path to be precise
      const { data: partial } = await supabase
        .from("applications")
        .select("id, company, role, status, cover_letter, resume_version, archetype, match_scores(overall, match_percentage)")
        .eq("clerk_user_id", userId)
        .is("deleted_at", null)
        .ilike("source_url", `%${domain}%`)
        .limit(1)
        .maybeSingle();

      if (partial) {
        const score = Array.isArray(partial.match_scores) ? partial.match_scores[0] : partial.match_scores;
        return NextResponse.json({
          match: {
            id: partial.id,
            company: partial.company,
            role: partial.role,
            status: partial.status,
            archetype: partial.archetype,
            has_cover_letter: !!partial.cover_letter,
            cover_letter: partial.cover_letter ?? null,
            resume_version: partial.resume_version ?? null,
            score: score
              ? {
                  overall: score.overall,
                  match_percentage: score.match_percentage,
                }
              : null,
          },
        });
      }
    }

    return NextResponse.json({ match: null });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
