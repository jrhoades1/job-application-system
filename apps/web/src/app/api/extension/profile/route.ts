import { NextResponse } from "next/server";
import { getExtensionClient } from "@/lib/extension-auth";

export async function GET(req: Request) {
  try {
    const { supabase, userId } = await getExtensionClient(req);

    const { data, error } = await supabase
      .from("profiles")
      .select("full_name, email, phone, location, linkedin_url, portfolio_url, work_history")
      .eq("clerk_user_id", userId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
