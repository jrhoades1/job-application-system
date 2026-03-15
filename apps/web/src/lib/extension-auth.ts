import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";

/**
 * Authenticate a request from the browser extension via Bearer token.
 * Falls back to Clerk session auth if no Bearer token present.
 *
 * Token format: the clerk_user_id itself, prefixed with "jaa_".
 * Simple but effective — the extension gets a token from the settings page.
 */
export async function getExtensionClient(req: Request) {
  const authHeader = req.headers.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);

    // Validate token format
    if (!token.startsWith("jaa_")) {
      throw new Error("Invalid token format");
    }

    const userId = token.slice(4); // Strip "jaa_" prefix
    if (!userId) throw new Error("Invalid token");

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify user exists
    const { data } = await supabase
      .from("profiles")
      .select("clerk_user_id")
      .eq("clerk_user_id", userId)
      .single();

    if (!data) throw new Error("Invalid token — user not found");

    return { supabase, userId };
  }

  // Fall back to Clerk session auth
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  return { supabase, userId };
}
