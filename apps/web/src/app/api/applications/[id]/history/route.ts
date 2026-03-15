import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const { id } = await params;

    const { data, error } = await supabase
      .from("application_status_history")
      .select("*")
      .eq("application_id", id)
      .eq("clerk_user_id", userId)
      .order("changed_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
