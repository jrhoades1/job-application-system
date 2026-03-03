import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";

export async function DELETE() {
  try {
    const { supabase, userId } = await getAuthenticatedClient();

    await supabase
      .from("email_connections")
      .update({ is_active: false, oauth_token: null })
      .eq("clerk_user_id", userId);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
