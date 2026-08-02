import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedClient } from "@/lib/supabase";
import {
  MAX_ACTIVE_TOKENS,
  extensionTokenPrefix,
  generateExtensionToken,
  hashExtensionToken,
} from "@/lib/extension-token";

/**
 * Manage extension API tokens.
 *
 * Deliberately NOT under /api/extension/* — that prefix is public in middleware
 * and authenticates with the extension bearer token. Minting and revoking
 * credentials requires a Clerk session, so a stolen extension token cannot be
 * used to mint more or to lock the owner out.
 */

const createSchema = z.object({
  label: z.string().trim().min(1).max(60).optional(),
});

const revokeSchema = z.object({
  id: z.string().uuid(),
});

const LIST_COLUMNS = "id, token_prefix, label, created_at, last_used_at";

export async function GET() {
  try {
    const { supabase, userId } = await getAuthenticatedClient();

    const { data, error } = await supabase
      .from("extension_tokens")
      .select(LIST_COLUMNS)
      .eq("clerk_user_id", userId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ tokens: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();

    const body = await req.json().catch(() => ({}));
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { count, error: countError } = await supabase
      .from("extension_tokens")
      .select("id", { count: "exact", head: true })
      .eq("clerk_user_id", userId)
      .is("revoked_at", null);

    if (countError) {
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if ((count ?? 0) >= MAX_ACTIVE_TOKENS) {
      return NextResponse.json(
        {
          error: `You already have ${MAX_ACTIVE_TOKENS} active tokens. Revoke one before generating another.`,
        },
        { status: 409 }
      );
    }

    const token = generateExtensionToken();

    const { data, error } = await supabase
      .from("extension_tokens")
      .insert({
        clerk_user_id: userId,
        token_hash: hashExtensionToken(token),
        token_prefix: extensionTokenPrefix(token),
        label: parsed.data.label ?? null,
      })
      .select(LIST_COLUMNS)
      .single();

    if (error) {
      // FK violation — the Clerk webhook hasn't created the profile row yet.
      if (error.code === "23503") {
        return NextResponse.json(
          { error: "Finish setting up your profile before generating a token." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    // The only time the plaintext is ever returned.
    return NextResponse.json({ ...data, token }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();

    const parsed = revokeSchema.safeParse({
      id: new URL(req.url).searchParams.get("id"),
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid token id" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("extension_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", parsed.data.id)
      .eq("clerk_user_id", userId) // never let one user revoke another's token
      .is("revoked_at", null)
      .select("id")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    return NextResponse.json({ revoked: data.id });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
