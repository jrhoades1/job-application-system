import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";
import { updateApplicationSchema } from "@/schemas/application";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const { id } = await params;

    const { data, error } = await supabase
      .from("applications")
      .select("*, match_scores(*)")
      .eq("id", id)
      .eq("clerk_user_id", userId)
      .single();

    if (error) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const { id } = await params;
    const body = await req.json();

    const parsed = updateApplicationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("applications")
      .update(parsed.data)
      .eq("id", id)
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

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const { id } = await params;

    const { error } = await supabase
      .from("applications")
      .delete()
      .eq("id", id)
      .eq("clerk_user_id", userId);

    if (error) {
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
