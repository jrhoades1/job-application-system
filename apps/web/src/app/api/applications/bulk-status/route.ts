import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";
import { bulkUpdateStatusSchema } from "@/schemas/application";

export async function PATCH(req: Request) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const body = await req.json();

    const parsed = bulkUpdateStatusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { ids, status } = parsed.data;
    const today = new Date().toISOString().split("T")[0];

    const updatePayload: Record<string, string> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (status === "rejected") {
      updatePayload.rejection_date = today;
    }
    if (status === "withdrawn") {
      updatePayload.skip_date = today;
      updatePayload.skip_reason = "Manually withdrawn";
    }

    // Fetch prior statuses so we can log real transitions to history.
    const { data: priorRows } = await supabase
      .from("applications")
      .select("id, status")
      .in("id", ids)
      .eq("clerk_user_id", userId);

    const { data, error } = await supabase
      .from("applications")
      .update(updatePayload)
      .in("id", ids)
      .eq("clerk_user_id", userId)
      .select("id");

    if (error) {
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    const updatedIds = new Set((data ?? []).map((r: { id: string }) => r.id));
    const historyRows = (priorRows ?? [])
      .filter((r) => updatedIds.has(r.id) && r.status !== status)
      .map((r) => ({
        application_id: r.id,
        clerk_user_id: userId,
        from_status: r.status,
        to_status: status,
        source: "manual_bulk",
      }));

    if (historyRows.length > 0) {
      await supabase.from("application_status_history").insert(historyRows);
    }

    return NextResponse.json({
      updated: data?.length ?? 0,
      ids: data?.map((row: { id: string }) => row.id) ?? [],
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
