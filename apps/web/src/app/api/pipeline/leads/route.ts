import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedClient } from "@/lib/supabase";
import { normalizeSource } from "@/lib/scrape-helpers";

const JUNK_ROLE_PATTERNS = [
  /jobs?\s+from\s+our\s+\d+\s+job\s+board\s+partners/i,
  /^all\s+.*\bjobs?\b/i,
  /new\s+opportunit(?:y|ies)\s+alert/i,
  /job\s+alert/i,
  /job\s+recommendations?/i,
];

function isJunkRoleTitle(role: string | null | undefined): boolean {
  if (!role) return false;
  return JUNK_ROLE_PATTERNS.some((p) => p.test(role));
}

const updateLeadSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["promote", "skip", "update_description"]).optional(),
  skip_reason: z.string().max(500).optional(),
  description_text: z.string().max(50000).optional(),
  career_page_url: z.string().url().max(2000).optional(),
});

// GET — list pipeline leads with optional status filter
export async function GET(req: Request) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const sort = searchParams.get("sort");

    let query = supabase
      .from("pipeline_leads")
      .select("*")
      .eq("clerk_user_id", userId)
      .is("deleted_at", null);

    if (sort === "newest") {
      query = query
        .order("email_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
    } else {
      // Best Match: SQL pre-sort; final ordering applied in JS below so the
      // tier (score_overall) takes precedence over raw match percentage.
      query = query
        .order("score_match_percentage", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query.limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const TIER_RANK: Record<string, number> = {
      strong: 0,
      good: 1,
      stretch: 2,
      long_shot: 3,
    };

    if (data) {
      if (sort === "newest") {
        // Re-bucket by day, then tier-break within each day so a "Good" lead
        // on the same day outranks a "Stretch" lead. email_date is a full
        // timestamp so SQL secondary sort alone doesn't bucket same-day leads.
        // Fall back to created_at for career_scan leads (no email_date) so
        // they bucket alongside same-day email-sourced leads.
        const dayBucket = (iso: string | null): string =>
          iso ? iso.slice(0, 10) : "";
        data.sort((a, b) => {
          const dayDiff = dayBucket(b.email_date ?? b.created_at).localeCompare(
            dayBucket(a.email_date ?? a.created_at)
          );
          if (dayDiff !== 0) return dayDiff;
          const tierDiff =
            (TIER_RANK[a.score_overall] ?? 99) -
            (TIER_RANK[b.score_overall] ?? 99);
          if (tierDiff !== 0) return tierDiff;
          return (b.score_match_percentage ?? 0) - (a.score_match_percentage ?? 0);
        });
      } else {
        // Best Match: tier first (strong → good → stretch → long_shot),
        // then match percentage within tier, then created_at. This ensures a
        // Good lead always outranks any Long Shot regardless of raw %.
        data.sort((a, b) => {
          const tierDiff =
            (TIER_RANK[a.score_overall] ?? 99) -
            (TIER_RANK[b.score_overall] ?? 99);
          if (tierDiff !== 0) return tierDiff;
          const pctDiff =
            (b.score_match_percentage ?? -1) - (a.score_match_percentage ?? -1);
          if (pctDiff !== 0) return pctDiff;
          return (
            new Date(b.created_at ?? 0).getTime() -
            new Date(a.created_at ?? 0).getTime()
          );
        });
      }
    }

    return NextResponse.json(data ?? []);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH — promote or skip a lead
export async function PATCH(req: Request) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const body = await req.json();
    const parsed = updateLeadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { id, action, skip_reason, description_text, career_page_url } = parsed.data;

    // Update career_page_url — lets the user paste a URL when the email
    // digest didn't include one, so the "Capture via Extension" path works.
    if (!action && career_page_url) {
      const { error } = await supabase
        .from("pipeline_leads")
        .update({ career_page_url })
        .eq("id", id)
        .eq("clerk_user_id", userId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    // Update description (after fetching full JD)
    if (action === "update_description" || (!action && description_text)) {
      if (!description_text) {
        return NextResponse.json({ error: "description_text required" }, { status: 400 });
      }
      const { error } = await supabase
        .from("pipeline_leads")
        .update({ description_text })
        .eq("id", id)
        .eq("clerk_user_id", userId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    if (action === "skip") {
      const { error } = await supabase
        .from("pipeline_leads")
        .update({
          status: "skipped",
          skip_reason: skip_reason ?? "Manually skipped",
        })
        .eq("id", id)
        .eq("clerk_user_id", userId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    // Promote: create application from lead
    const { data: lead } = await supabase
      .from("pipeline_leads")
      .select("*")
      .eq("id", id)
      .eq("clerk_user_id", userId)
      .single();

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Reject digest/notification subjects that got misparsed as a role title
    if (isJunkRoleTitle(lead.role)) {
      return NextResponse.json(
        { error: "Cannot promote: this lead's role looks like a digest email subject, not a real job title. Skip it or capture the real posting." },
        { status: 400 }
      );
    }

    // Job description is required — refuse to promote without a real JD
    // (stubs like "Director of Engineering at Company" are under 200 chars)
    const descText = (lead.description_text ?? "").trim();
    if (!descText || descText.length < 200) {
      return NextResponse.json(
        { error: "Cannot promote: this lead has no real job description. Capture the JD from the actual posting first." },
        { status: 400 }
      );
    }

    // Dedup: if an active application already exists for same company+role,
    // treat the promote as idempotent — heal the lead status and return the
    // existing application id so the client can route to it. This covers the
    // case where a prior promote created the app but failed to flip the lead
    // status, leaving the lead stuck in pending_review.
    const { data: existingApp } = await supabase
      .from("applications")
      .select("id")
      .eq("clerk_user_id", userId)
      .eq("company", lead.company)
      .eq("role", lead.role)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (existingApp) {
      await supabase
        .from("pipeline_leads")
        .update({ status: "promoted" })
        .eq("id", id)
        .eq("clerk_user_id", userId);
      return NextResponse.json({
        success: true,
        application_id: existingApp.id,
        already_existed: true,
      });
    }

    const { data: app, error: appError } = await supabase
      .from("applications")
      .insert({
        clerk_user_id: userId,
        company: lead.company,
        role: lead.role,
        location: lead.location,
        source: normalizeSource(lead.source_platform) ?? "Email Pipeline",
        source_url: lead.career_page_url,
        job_description: descText,
        status: lead.score_overall === "strong" || lead.score_overall === "good" ? "ready_to_apply" : "evaluating",
      })
      .select()
      .single();

    if (appError) {
      return NextResponse.json({ error: appError.message }, { status: 500 });
    }

    // Create match score if available
    if (lead.score_overall) {
      const details = lead.score_details as Record<string, unknown> | null;
      await supabase.from("match_scores").insert({
        application_id: app.id,
        clerk_user_id: userId,
        overall: lead.score_overall,
        match_percentage: lead.score_match_percentage,
        strong_count: details?.strong_count ?? 0,
        partial_count: details?.partial_count ?? 0,
        gap_count: details?.gap_count ?? 0,
        red_flags: lead.red_flags ?? [],
      });
    }

    // Seed status history
    await supabase.from("application_status_history").insert({
      application_id: app.id,
      clerk_user_id: userId,
      from_status: null,
      to_status: app.status,
      source: "promotion",
    });

    // Update lead status
    await supabase
      .from("pipeline_leads")
      .update({ status: "promoted" })
      .eq("id", id)
      .eq("clerk_user_id", userId);

    return NextResponse.json({ success: true, application_id: app.id });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
