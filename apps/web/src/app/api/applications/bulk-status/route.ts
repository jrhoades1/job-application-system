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

    const updatePayload: Record<string, string> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (status === "rejected") {
      updatePayload.rejection_date = new Date().toISOString().split("T")[0];
    }

    const { data, error } = await supabase
      .from("applications")
      .update(updatePayload)
      .in("id", ids)
      .eq("clerk_user_id", userId)
      .select("id");

    if (error) {
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({
      updated: data?.length ?? 0,
      ids: data?.map((row: { id: string }) => row.id) ?? [],
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
