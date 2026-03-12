import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedClient } from "@/lib/supabase";

const updateLeadSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["promote", "skip"]),
  skip_reason: z.string().max(500).optional(),
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
      query = query.order("created_at", { ascending: false });
    } else {
      query = query
        .order("rank", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query.limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
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

    const { id, action, skip_reason } = parsed.data;

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

    // Create application
    const { data: app, error: appError } = await supabase
      .from("applications")
      .insert({
        clerk_user_id: userId,
        company: lead.company,
        role: lead.role,
        location: lead.location,
        source: lead.source_platform ?? "Email Pipeline",
        source_url: lead.career_page_url,
        job_description: lead.description_text,
        status: "pending_review",
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

    // Update lead status
    await supabase
      .from("pipeline_leads")
      .update({ status: "promoted" })
      .eq("id", id);

    return NextResponse.json({ success: true, application_id: app.id });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
