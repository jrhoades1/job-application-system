import { NextResponse } from "next/server";
import { getExtensionClient } from "@/lib/extension-auth";

export async function POST(req: Request) {
  try {
    const { supabase, userId } = await getExtensionClient(req);
    const { application_id } = await req.json();

    if (!application_id) {
      return NextResponse.json({ error: "application_id required" }, { status: 400 });
    }

    const today = new Date().toISOString().split("T")[0];
    const followUp = new Date();
    followUp.setDate(followUp.getDate() + 7);

    // Fetch current status for history
    const { data: current } = await supabase
      .from("applications")
      .select("status")
      .eq("id", application_id)
      .eq("clerk_user_id", userId)
      .single();

    if (!current) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    // Update application
    const { error } = await supabase
      .from("applications")
      .update({
        status: "applied",
        applied_date: today,
        follow_up_date: followUp.toISOString().split("T")[0],
      })
      .eq("id", application_id)
      .eq("clerk_user_id", userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Record status change
    if (current.status !== "applied") {
      await supabase.from("application_status_history").insert({
        application_id,
        clerk_user_id: userId,
        from_status: current.status,
        to_status: "applied",
        source: "extension",
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
