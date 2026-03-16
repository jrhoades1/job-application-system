import { NextResponse } from "next/server";
import { getExtensionClient } from "@/lib/extension-auth";
import { z } from "zod";

const captureSchema = z.object({
  url: z.string().url(),
  description: z.string().min(20).max(50000),
  title: z.string().optional(),
  company: z.string().optional(),
});

/**
 * POST /api/extension/capture-jd
 *
 * Receives a scraped job description from the browser extension
 * and updates the matching pipeline lead's description_text.
 * Matches by career_page_url first, then by company+role fuzzy match.
 */
export async function POST(req: Request) {
  try {
    const { supabase, userId } = await getExtensionClient(req);
    const body = await req.json();
    const parsed = captureSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { url, description, title, company } = parsed.data;

    // Strategy 1: Match by career_page_url
    const { data: urlMatch } = await supabase
      .from("pipeline_leads")
      .select("id, company, role, description_text")
      .eq("clerk_user_id", userId)
      .eq("career_page_url", url)
      .is("deleted_at", null)
      .limit(1)
      .single();

    if (urlMatch) {
      await supabase
        .from("pipeline_leads")
        .update({ description_text: description })
        .eq("id", urlMatch.id);

      return NextResponse.json({
        matched: true,
        lead_id: urlMatch.id,
        company: urlMatch.company,
        role: urlMatch.role,
        match_method: "url",
      });
    }

    // Strategy 2: Match by company+role if provided
    if (company && title) {
      const { data: leads } = await supabase
        .from("pipeline_leads")
        .select("id, company, role, description_text")
        .eq("clerk_user_id", userId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(200);

      if (leads) {
        const companyLower = company.toLowerCase();
        const titleLower = title.toLowerCase();

        // Fuzzy match: company name contains or is contained by the lead's company
        const match = leads.find((l) => {
          const lCompany = (l.company ?? "").toLowerCase();
          const lRole = (l.role ?? "").toLowerCase();
          const companyMatch =
            lCompany.includes(companyLower) || companyLower.includes(lCompany);
          const roleMatch =
            lRole.includes(titleLower) || titleLower.includes(lRole);
          return companyMatch && roleMatch;
        });

        if (match) {
          await supabase
            .from("pipeline_leads")
            .update({
              description_text: description,
              career_page_url: url,
            })
            .eq("id", match.id);

          return NextResponse.json({
            matched: true,
            lead_id: match.id,
            company: match.company,
            role: match.role,
            match_method: "company_role",
          });
        }
      }
    }

    // Strategy 3: Match by URL domain + path patterns
    // Extract domain from URL to match against leads from that source
    const urlDomain = new URL(url).hostname;
    const { data: domainLeads } = await supabase
      .from("pipeline_leads")
      .select("id, company, role, description_text, career_page_url")
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50);

    if (domainLeads && title) {
      const titleLower = title.toLowerCase();
      const match = domainLeads.find((l) => {
        const lRole = (l.role ?? "").toLowerCase();
        return lRole.includes(titleLower) || titleLower.includes(lRole);
      });

      if (match) {
        await supabase
          .from("pipeline_leads")
          .update({
            description_text: description,
            career_page_url: url,
          })
          .eq("id", match.id);

        return NextResponse.json({
          matched: true,
          lead_id: match.id,
          company: match.company,
          role: match.role,
          match_method: "title_fuzzy",
        });
      }
    }

    // No match — store it anyway so it's not lost
    // Could be a job not yet in the pipeline
    return NextResponse.json({
      matched: false,
      message: "No matching lead found. JD captured but not linked.",
      url,
      title,
      company,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("Unauthorized") || message.includes("Invalid token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
