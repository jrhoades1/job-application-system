import { NextResponse } from "next/server";
import { getExtensionClient } from "@/lib/extension-auth";
import { z } from "zod";
import { rescoreLead } from "@/lib/rescore-lead";
import { extractPostingId } from "@/lib/posting-id";
import { pickPendingLeadToUpdate } from "@/lib/match-pending-lead";

const importSchema = z.object({
  url: z.string().url(),
  job_description: z.string().min(50).max(50000),
  role: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  location: z.string().max(200).optional(),
  salary: z.string().max(200).optional(),
});

/**
 * POST /api/extension/import-job
 *
 * Creates an application directly from the Chrome extension's "Import Job" button.
 * Requires JD — won't create without one. Deduplicates by source_url.
 */
export async function POST(req: Request) {
  try {
    const { supabase, userId } = await getExtensionClient(req);
    const body = await req.json();
    const parsed = importSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { url, job_description, role, company, location } = parsed.data;
    const key = extractPostingId(url);

    // If this URL matches a lead the user is still triaging (pending_review),
    // treat this as a "fix the JD on the open lead" flow: update the lead in
    // place and leave it in New Leads. No app is created, no promotion. The
    // lead sheet's visibilitychange listener picks up the new JD on return.
    //
    // Match precedence (see pickPendingLeadToUpdate): exact URL → canonical
    // posting id → single-match fuzzy company+role. The fuzzy fallback only
    // fires for an unambiguous single match so we don't hijack an unrelated
    // lead — required for the common path where the user clicks "Search
    // LinkedIn" on a no-URL lead and imports from the search panel.
    {
      const { data: pendingLeads } = await supabase
        .from("pipeline_leads")
        .select("id, company, role, career_page_url")
        .eq("clerk_user_id", userId)
        .eq("status", "pending_review")
        .is("deleted_at", null)
        .limit(500);

      const leadMatch = pickPendingLeadToUpdate(
        pendingLeads ?? [],
        url,
        company,
        role,
      );

      if (leadMatch) {
        await supabase
          .from("pipeline_leads")
          .update({
            description_text: job_description,
            career_page_url: url,
          })
          .eq("id", leadMatch.id);
        await rescoreLead(supabase, leadMatch.id, job_description, userId);

        return NextResponse.json({
          imported: false,
          // duplicate + jd_updated are included for backward compat with older
          // installed extension builds that only know those flags — they'll
          // render a friendly "Already tracked — JD updated" toast instead of
          // falling through to the error branch. New builds check lead_updated
          // first and render a distinct "JD Updated" message.
          duplicate: true,
          jd_updated: true,
          lead_updated: true,
          lead_id: leadMatch.id,
          company: leadMatch.company ?? company,
          role: leadMatch.role ?? role,
        });
      }
    }

    // Check for duplicate: first by exact source_url, then by canonical job key
    // (so LinkedIn /comm/jobs/view/X and /jobs/view/X collapse to one app).
    let { data: existing } = await supabase
      .from("applications")
      .select("id, company, role, status")
      .eq("clerk_user_id", userId)
      .eq("source_url", url)
      .is("deleted_at", null)
      .maybeSingle();

    if (!existing && key) {
      const { data: candidates } = await supabase
        .from("applications")
        .select("id, company, role, status, source_url")
        .eq("clerk_user_id", userId)
        .is("deleted_at", null)
        .not("source_url", "is", null)
        .limit(500);
      const match = (candidates ?? []).find(
        (c) => c.source_url && extractPostingId(c.source_url) === key,
      );
      if (match) {
        existing = {
          id: match.id,
          company: match.company,
          role: match.role,
          status: match.status,
        };
      }
    }

    if (existing) {
      // Always update JD on the existing app
      await supabase
        .from("applications")
        .update({ job_description })
        .eq("id", existing.id)
        .eq("clerk_user_id", userId);

      // Also update any matching leads
      const { data: dupLeads } = await supabase
        .from("pipeline_leads")
        .select("id, company, role, career_page_url")
        .eq("clerk_user_id", userId)
        .is("deleted_at", null)
        .limit(500);

      if (dupLeads) {
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
        const matching = dupLeads.filter((l) => {
          if (l.career_page_url === url) return true;
          const cm = norm(l.company ?? "").includes(norm(existing.company)) || norm(existing.company).includes(norm(l.company ?? ""));
          const rm = norm(l.role ?? "").includes(norm(existing.role)) || norm(existing.role).includes(norm(l.role ?? ""));
          return cm && rm;
        });
        for (const lead of matching) {
          await supabase
            .from("pipeline_leads")
            .update({
              description_text: job_description,
              career_page_url: url,
              status: "promoted",
            })
            .eq("id", lead.id);
          await rescoreLead(supabase, lead.id, job_description, userId);
        }
      }

      return NextResponse.json({
        imported: false,
        duplicate: true,
        jd_updated: true,
        application_id: existing.id,
        company: existing.company,
        role: existing.role,
      });
    }

    // Update any matching pipeline lead with the real JD
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    const { data: leads } = await supabase
      .from("pipeline_leads")
      .select("id, company, role, career_page_url")
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .in("status", ["pending_review", "promoted"])
      .limit(500);

    if (leads) {
      const matchingLeads = leads.filter((l) => {
        // Match by URL
        if (l.career_page_url === url) return true;
        // Match by company + role fuzzy
        const companyMatch = norm(l.company ?? "").includes(norm(company)) || norm(company).includes(norm(l.company ?? ""));
        const roleMatch = norm(l.role ?? "").includes(norm(role)) || norm(role).includes(norm(l.role ?? ""));
        return companyMatch && roleMatch;
      });

      for (const lead of matchingLeads) {
        await supabase
          .from("pipeline_leads")
          .update({
            description_text: job_description,
            career_page_url: url,
            status: "promoted",
          })
          .eq("id", lead.id);
        await rescoreLead(supabase, lead.id, job_description, userId);
      }
    }

    // Infer source platform from URL
    const host = new URL(url).hostname.toLowerCase();
    let source = "Direct";
    if (host.includes("linkedin")) source = "LinkedIn";
    else if (host.includes("indeed")) source = "Indeed";
    else if (host.includes("ziprecruiter")) source = "ZipRecruiter";
    else if (host.includes("glassdoor")) source = "Glassdoor";
    else if (host.includes("greenhouse")) source = "Greenhouse";
    else if (host.includes("lever")) source = "Lever";
    else if (host.includes("workday") || host.includes("myworkdayjobs")) source = "Workday";
    else if (host.includes("smartrecruiters")) source = "SmartRecruiters";
    else if (host.includes("ashby")) source = "Ashby";

    // Create the application
    const { data: app, error } = await supabase
      .from("applications")
      .insert({
        clerk_user_id: userId,
        company,
        role,
        location: location ?? null,
        source,
        source_url: url,
        job_description,
        status: "evaluating",
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Seed status history
    await supabase.from("application_status_history").insert({
      application_id: app.id,
      clerk_user_id: userId,
      from_status: null,
      to_status: "evaluating",
      source: "extension_import",
    });

    return NextResponse.json({
      imported: true,
      application_id: app.id,
      company,
      role,
      source,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("Unauthorized") || message.includes("Invalid token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
