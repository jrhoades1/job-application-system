import { NextResponse } from "next/server";
import { getExtensionClient } from "@/lib/extension-auth";
import { z } from "zod";

const captureSchema = z.object({
  url: z.string().url(),
  description: z.string().min(20).max(50000),
  title: z.string().optional(),
  company: z.string().optional(),
});

/** Normalize text for fuzzy matching: lowercase, strip punctuation, collapse whitespace */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

/** Check if two strings are a fuzzy match (one contains the other, or share significant words) */
function fuzzyMatch(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  // Check word overlap: if >50% of words in the shorter string appear in the longer
  const wordsA = na.split(" ");
  const wordsB = nb.split(" ");
  const shorter = wordsA.length <= wordsB.length ? wordsA : wordsB;
  const longer = wordsA.length > wordsB.length ? wordsA : wordsB;
  const longerText = longer.join(" ");
  const matches = shorter.filter((w) => w.length > 2 && longerText.includes(w));
  return matches.length >= Math.ceil(shorter.length * 0.5);
}

/**
 * POST /api/extension/capture-jd
 *
 * Receives a scraped job description from the browser extension
 * and updates the matching pipeline lead's description_text.
 * If no match found, creates a new lead.
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

    // Load all active leads once for matching
    const { data: leads } = await supabase
      .from("pipeline_leads")
      .select("id, company, role, description_text, career_page_url")
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500);

    const allLeads = leads ?? [];

    // Strategy 1: Match by career_page_url
    const urlMatch = allLeads.find((l) => l.career_page_url === url);
    if (urlMatch) {
      // Update description, and also update company/role if we have better values
      const updatedCompany = (company && company !== "Unknown") ? company : urlMatch.company;
      const updatedRole = (title && title !== "Unknown Role") ? title : urlMatch.role;
      await supabase
        .from("pipeline_leads")
        .update({
          description_text: description,
          company: updatedCompany,
          role: updatedRole,
        })
        .eq("id", urlMatch.id);

      return NextResponse.json({
        matched: true,
        lead_id: urlMatch.id,
        company: updatedCompany,
        role: updatedRole,
        match_method: "url",
      });
    }

    // Strategy 2: Match by company+role fuzzy match
    if (company && title) {
      const match = allLeads.find((l) =>
        fuzzyMatch(l.company ?? "", company) && fuzzyMatch(l.role ?? "", title)
      );

      if (match) {
        await supabase
          .from("pipeline_leads")
          .update({ description_text: description, career_page_url: url })
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

    // Strategy 3: Match by role title only (across all leads)
    if (title) {
      const match = allLeads.find((l) => fuzzyMatch(l.role ?? "", title));

      if (match) {
        await supabase
          .from("pipeline_leads")
          .update({ description_text: description, career_page_url: url })
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

    // No match — create a new lead from this JD
    const sourcePlatform = inferPlatform(url);
    const { data: newLead } = await supabase
      .from("pipeline_leads")
      .insert({
        clerk_user_id: userId,
        company: company || inferCompanyFromUrl(url) || "Unknown",
        role: title || "Unknown Role",
        description_text: description,
        career_page_url: url,
        source_platform: sourcePlatform,
        email_uid: `ext_${Date.now()}`,
        status: "pending_review",
        created_at: new Date().toISOString(),
      })
      .select("id, company, role")
      .single();

    return NextResponse.json({
      matched: true,
      created: true,
      lead_id: newLead?.id,
      company: newLead?.company ?? company,
      role: newLead?.role ?? title,
      match_method: "created_new",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("Unauthorized") || message.includes("Invalid token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

function inferPlatform(url: string): string | null {
  const host = new URL(url).hostname.toLowerCase();
  if (host.includes("linkedin")) return "LinkedIn";
  if (host.includes("ziprecruiter")) return "ZipRecruiter";
  if (host.includes("indeed")) return "Indeed";
  if (host.includes("glassdoor")) return "Glassdoor";
  if (host.includes("greenhouse")) return "Greenhouse";
  if (host.includes("lever")) return "Lever";
  return null;
}

function inferCompanyFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    // e.g., "jobs.acme.com" → "acme"
    const parts = host.replace("www.", "").split(".");
    if (parts.length >= 2 && !["com", "io", "co", "org"].includes(parts[0])) {
      return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    }
  } catch { /* ignore */ }
  return null;
}
