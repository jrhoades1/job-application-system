import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedClient } from "@/lib/supabase";
import { normalizeSource } from "@/lib/scrape-helpers";

const updateLeadSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["promote", "skip", "update_description"]).optional(),
  skip_reason: z.string().max(500).optional(),
  description_text: z.string().max(50000).optional(),
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
      // Best Match: sort by match percentage descending (highest first)
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

    // Newest sort: re-bucket by day, then tier-break within each day by
    // score so a "Good" lead on the same day outranks a "Stretch" lead.
    // email_date is a full timestamp so SQL secondary sort alone doesn't
    // bucket same-day leads.
    if (sort === "newest" && data) {
      const TIER_RANK: Record<string, number> = {
        strong: 0,
        good: 1,
        stretch: 2,
        long_shot: 3,
      };
      const dayBucket = (iso: string | null): string =>
        iso ? iso.slice(0, 10) : "";
      data.sort((a, b) => {
        const dayDiff = dayBucket(b.email_date).localeCompare(dayBucket(a.email_date));
        if (dayDiff !== 0) return dayDiff;
        const tierDiff =
          (TIER_RANK[a.score_overall] ?? 99) - (TIER_RANK[b.score_overall] ?? 99);
        if (tierDiff !== 0) return tierDiff;
        return (b.score_match_percentage ?? 0) - (a.score_match_percentage ?? 0);
      });
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

    const { id, action, skip_reason, description_text } = parsed.data;

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
