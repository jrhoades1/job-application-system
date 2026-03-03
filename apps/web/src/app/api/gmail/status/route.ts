import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";

export async function GET() {
  try {
    const { supabase, userId } = await getAuthenticatedClient();

    const { data } = await supabase
      .from("email_connections")
      .select("email_address, last_fetch_at, is_active")
      .eq("clerk_user_id", userId)
      .maybeSingle();

    if (!data || !data.is_active) {
      return NextResponse.json(null);
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(null);
  }
}
