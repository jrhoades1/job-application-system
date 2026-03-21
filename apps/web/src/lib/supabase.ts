import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";

// Lazy-initialized server-side client with service-role key (bypasses RLS)
// NEVER import this on the client side
let _supabaseAdmin: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _supabaseAdmin;
}

/**
 * Get a service-role Supabase client (no user auth context).
 * Use ONLY in cron jobs or internal server-to-server calls.
 * All queries MUST manually filter by clerk_user_id.
 */
export function getServiceRoleClient(): SupabaseClient {
  return getSupabaseAdmin();
}

/**
 * Get an authenticated Supabase client scoped to the current Clerk user.
 * Every query MUST use the returned userId to filter data.
 */
export async function getAuthenticatedClient() {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Unauthorized: no Clerk session");
  }

  return {
    supabase: getSupabaseAdmin(),
    userId,
  };
}

/**
 * Convenience: get supabase + userId, or return null if not authenticated.
 * Use this for optional auth checks.
 */
export async function getOptionalClient() {
  const { userId } = await auth();
  if (!userId) return null;

  return {
    supabase: getSupabaseAdmin(),
    userId,
  };
}
