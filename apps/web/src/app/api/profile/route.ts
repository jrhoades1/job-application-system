import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";
import { updateProfileSchema } from "@/schemas/profile";

export async function GET() {
  try {
    const { supabase, userId } = await getAuthenticatedClient();

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("clerk_user_id", userId)
      .single();

    if (error && error.code !== "PGRST116") {
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PUT(req: Request) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const body = await req.json();

    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("profiles")
      .update(parsed.data)
      .eq("clerk_user_id", userId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
