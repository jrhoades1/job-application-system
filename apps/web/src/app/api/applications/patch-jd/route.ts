import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";
import { z } from "zod";

/**
 * POST /api/applications/patch-jd
 *
 * Bulk-update job descriptions on applications.
 * Used by browser console scripts that extract JDs from auth-walled sites.
 *
 * Auth: x-cron-secret + x-cron-user-id
 */

const patchSchema = z.object({
  updates: z.array(z.object({
    application_id: z.string().uuid(),
    job_description: z.string().min(20).max(50000),
  })).min(1).max(100),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-cron-secret, x-cron-user-id",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const cronSecret = req.headers.get("x-cron-secret");
    const cronUserId = req.headers.get("x-cron-user-id");

    if (!cronSecret || cronSecret !== process.env.CRON_SECRET || !cronUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    }

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400, headers: corsHeaders }
      );
    }

    const supabase = getServiceRoleClient();
    let updated = 0;
    let failed = 0;

    for (const item of parsed.data.updates) {
      const { error } = await supabase
        .from("applications")
        .update({ job_description: item.job_description })
        .eq("id", item.application_id)
        .eq("clerk_user_id", cronUserId);

      if (error) {
        failed++;
      } else {
        updated++;
      }
    }

    return NextResponse.json({ updated, failed, total: parsed.data.updates.length }, { headers: corsHeaders });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: corsHeaders });
  }
}
