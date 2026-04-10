import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedClient } from "@/lib/supabase";

const addAchievementSchema = z.object({
  category: z.string().min(1),
  text: z.string().min(5, "Achievement must be at least 5 characters"),
});

/**
 * POST /api/profile/add-achievement
 * Adds a single achievement to a category in the user's profile.
 * Creates the category if it doesn't exist.
 */
export async function POST(req: Request) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const body = await req.json();

    const parsed = addAchievementSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { category, text } = parsed.data;

    // Load current achievements
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("achievements")
      .eq("clerk_user_id", userId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const achievements: { category: string; items: { text: string }[] }[] =
      profile.achievements ?? [];

    // Find or create category
    const existing = achievements.find(
      (c) => c.category.toLowerCase() === category.toLowerCase()
    );

    if (existing) {
      existing.items.push({ text });
    } else {
      achievements.push({ category, items: [{ text }] });
    }

    // Save
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ achievements, updated_at: new Date().toISOString() })
      .eq("clerk_user_id", userId);

    if (updateError) {
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    return NextResponse.json({ success: true, category, text });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
