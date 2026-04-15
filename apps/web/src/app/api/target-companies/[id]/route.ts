/**
 * DELETE /api/target-companies/[id] — stop watching a company.
 *
 * Cascades to company_job_snapshots and career_scan_runs via FK ON DELETE
 * CASCADE. Existing pipeline_leads seeded from this company are kept.
 */

import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";

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
