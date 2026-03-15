import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";
import { getExtensionClient } from "@/lib/extension-auth";
import { updateApplicationSchema } from "@/schemas/application";

/** Authenticate via Clerk session or extension Bearer token */
async function authenticate(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return getExtensionClient(req);
  }
  return getAuthenticatedClient();
}

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
      .is("deleted_at", null)
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
    const { supabase, userId } = await authenticate(req);
    const { id } = await params;
    const body = await req.json();

    const parsed = updateApplicationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updateData = { ...parsed.data };

    // Auto-compute dates when status changes to "applied"
    if (updateData.status === "applied") {
      if (!updateData.applied_date) {
        updateData.applied_date = new Date().toISOString().split("T")[0];
      }
      if (!updateData.follow_up_date) {
        const followUp = new Date(updateData.applied_date);
        followUp.setDate(followUp.getDate() + 7);
        updateData.follow_up_date = followUp.toISOString().split("T")[0];
      }
    }

    // Fetch current status for history tracking
    let previousStatus: string | null = null;
    if (updateData.status) {
      const { data: current } = await supabase
        .from("applications")
        .select("status")
        .eq("id", id)
        .eq("clerk_user_id", userId)
        .single();
      previousStatus = current?.status ?? null;
    }

    const { data, error } = await supabase
      .from("applications")
      .update(updateData)
      .eq("id", id)
      .eq("clerk_user_id", userId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    // Record status change in history
    if (updateData.status && updateData.status !== previousStatus) {
      await supabase.from("application_status_history").insert({
        application_id: id,
        clerk_user_id: userId,
        from_status: previousStatus,
        to_status: updateData.status,
        source: "manual",
      });
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
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("clerk_user_id", userId)
      .is("deleted_at", null);

    if (error) {
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
