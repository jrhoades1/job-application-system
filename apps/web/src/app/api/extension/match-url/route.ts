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
    const { data: exact } = await supabase
      .from("applications")
      .select("id, company, role, status")
      .eq("clerk_user_id", userId)
      .eq("source_url", url)
      .is("deleted_at", null)
      .maybeSingle();

    if (exact) {
      return NextResponse.json({ match: exact });
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
        .select("id, company, role, status")
        .eq("clerk_user_id", userId)
        .is("deleted_at", null)
        .ilike("source_url", `%${domain}%`)
        .limit(1)
        .maybeSingle();

      if (partial) {
        return NextResponse.json({ match: partial });
      }
    }

    return NextResponse.json({ match: null });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
