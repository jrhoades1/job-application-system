import { auth } from "@clerk/nextjs/server";
import { getServiceRoleClient } from "@/lib/supabase";
import { hashExtensionToken, isExtensionTokenShape } from "@/lib/extension-token";

/** Only touch last_used_at this often — one write per request is wasteful. */
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

/**
 * Authenticate a request from the browser extension via Bearer token.
 * Falls back to Clerk session auth if no Bearer token present.
 *
 * The token is a random secret generated from Settings → Extension. We look it
 * up by SHA-256 hash; the user id is derived from the matched row, never from
 * the token itself. Revoked tokens are rejected.
 */
export async function getExtensionClient(req: Request) {
  const authHeader = req.headers.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();

    // Fail closed on anything that isn't the current token shape. This also
    // rejects the retired `jaa_<clerk_user_id>` tokens.
    if (!isExtensionTokenShape(token)) {
      throw new Error("Unauthorized");
    }

    const supabase = getServiceRoleClient();

    const { data } = await supabase
      .from("extension_tokens")
      .select("id, clerk_user_id, revoked_at, last_used_at")
      .eq("token_hash", hashExtensionToken(token))
      .maybeSingle();

    if (!data || data.revoked_at) {
      throw new Error("Unauthorized");
    }

    await touchLastUsed(supabase, data.id, data.last_used_at);

    return { supabase, userId: data.clerk_user_id as string };
  }

  // Fall back to Clerk session auth (the web app calling its own routes).
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  return { supabase: getServiceRoleClient(), userId };
}

async function touchLastUsed(
  supabase: ReturnType<typeof getServiceRoleClient>,
  id: string,
  lastUsedAt: string | null
): Promise<void> {
  const stale =
    !lastUsedAt || Date.now() - new Date(lastUsedAt).getTime() > LAST_USED_THROTTLE_MS;
  if (!stale) return;

  // Best effort — a failed bookkeeping write must not fail the request.
  const { error } = await supabase
    .from("extension_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.warn("[extension-auth] failed to update last_used_at", error.message);
  }
}
