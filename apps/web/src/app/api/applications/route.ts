import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";
import { createApplicationSchema } from "@/schemas/application";

export async function GET(req: Request) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const { searchParams } = new URL(req.url);

    const status = searchParams.get("status");
    const source = searchParams.get("source");
    const limit = parseInt(searchParams.get("limit") ?? "50");
    const offset = parseInt(searchParams.get("offset") ?? "0");

    let query = supabase
      .from("applications")
      .select("*, match_scores(*)", { count: "exact" })
      .eq("clerk_user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }
    if (source) {
      query = query.eq("source", source);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ data, count });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const body = await req.json();

    const parsed = createApplicationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("applications")
      .insert({ ...parsed.data, clerk_user_id: userId })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
