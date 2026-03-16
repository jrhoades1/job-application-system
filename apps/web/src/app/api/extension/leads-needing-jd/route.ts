import { NextResponse } from "next/server";
import { getExtensionClient } from "@/lib/extension-auth";

/**
 * GET /api/extension/leads-needing-jd
 *
 * Returns leads with stub descriptions that need real JDs.
 * Includes a constructed LinkedIn search URL for each.
 */
export async function GET(req: Request) {
  try {
    const { supabase, userId } = await getExtensionClient(req);

    const { data: leads, error } = await supabase
      .from("pipeline_leads")
      .select("id, company, role, location, description_text, career_page_url, source_platform")
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .not("company", "is", null)
      .not("role", "is", null)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Filter to leads with stub descriptions
    const needsJD = (leads ?? [])
      .filter((l) => {
        const desc = (l.description_text ?? "").trim();
        return desc.length < 200 && l.company && l.role;
      })
      .map((l) => ({
        id: l.id,
        company: l.company,
        role: l.role,
        location: l.location,
        career_page_url: l.career_page_url,
        search_url: buildLinkedInSearchUrl(l.role!, l.company!),
      }));

    return NextResponse.json({
      count: needsJD.length,
      leads: needsJD,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("Unauthorized") || message.includes("Invalid token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

function buildLinkedInSearchUrl(role: string, company: string): string {
  const query = `${role} ${company}`;
  return `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(query)}&refresh=true`;
}
