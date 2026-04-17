/**
 * PATCH  /api/target-companies/[id] — edit applied_facets (Workday filter).
 * DELETE /api/target-companies/[id] — stop watching a company.
 *
 * Cascades to company_job_snapshots and career_scan_runs via FK ON DELETE
 * CASCADE. Existing pipeline_leads seeded from this company are kept.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedClient } from "@/lib/supabase";

const FacetValuesSchema = z.array(z.string().min(1).max(200)).max(20);
const AppliedFacetsSchema = z
  .record(z.string().min(1).max(100), FacetValuesSchema)
  .refine((obj) => Object.keys(obj).length <= 10, {
    message: "Max 10 facet keys",
  });

const PatchSchema = z.object({
  appliedFacets: AppliedFacetsSchema,
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const { id } = await params;

    const body = await req.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Verify ownership + vendor = workday before accepting facets.
    const { data: existing, error: selErr } = await supabase
      .from("target_companies")
      .select("id, ats_vendor")
      .eq("id", id)
      .eq("clerk_user_id", userId)
      .single();

    if (selErr || !existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing.ats_vendor !== "workday") {
      return NextResponse.json(
        { error: "Applied facets are Workday-only." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("target_companies")
      .update({ applied_facets: parsed.data.appliedFacets })
      .eq("id", id)
      .eq("clerk_user_id", userId)
      .select("id, company_name, ats_vendor, applied_facets")
      .single();

    if (error) {
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    return NextResponse.json({ target: data });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const { id } = await params;

    const { error } = await supabase
      .from("target_companies")
      .delete()
      .eq("id", id)
      .eq("clerk_user_id", userId);

    if (error) {
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
