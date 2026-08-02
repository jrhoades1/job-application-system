import { Webhook } from "svix";
import { headers } from "next/headers";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { PLAN_CONFIG, type PlanType } from "@/lib/stripe";

let _supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _supabase;
}

interface ClerkWebhookEvent {
  type: string;
  data: {
    id: string;
    email_addresses: { email_address: string }[];
    first_name: string | null;
    last_name: string | null;
  };
}

interface ProvisioningOverride {
  plan_type: PlanType;
  monthly_ai_cap_usd: number;
  block_on_cap: boolean;
  preferences: Record<string, unknown>;
  profile: Record<string, unknown>;
}

/** Default cost_config values, mirrored from the column defaults in migration 001. */
const DEFAULT_PROVISIONING: ProvisioningOverride = {
  plan_type: "free",
  monthly_ai_cap_usd: 10.0,
  block_on_cap: true,
  preferences: {},
  profile: {},
};

/**
 * Profile columns an allowlist row is permitted to seed. Deliberately excludes
 * clerk_user_id and email, which are owned by Clerk — a seeded value there
 * would either break the row or let one identity claim another's data.
 */
const PROFILE_SEED_KEYS = [
  "phone",
  "location",
  "linkedin_url",
  "portfolio_url",
  "narrative",
  "achievements",
  "work_history",
] as const;

function pickSeedableProfileFields(
  profile: Record<string, unknown>
): Record<string, unknown> {
  const seeded: Record<string, unknown> = {};
  for (const key of PROFILE_SEED_KEYS) {
    if (profile[key] !== undefined) seeded[key] = profile[key];
  }
  return seeded;
}

/**
 * Look up an elevated-limits override for this email so invited users are
 * provisioned correctly at signup instead of needing a manual DB bump.
 * Falls back to standard free-tier defaults when no row exists.
 */
async function getProvisioning(email: string): Promise<ProvisioningOverride> {
  if (!email) return DEFAULT_PROVISIONING;

  const { data, error } = await getSupabase()
    .from("provisioning_overrides")
    .select("plan_type, monthly_ai_cap_usd, block_on_cap, preferences, profile")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (error) {
    console.error("Provisioning override lookup failed:", error.message);
    return DEFAULT_PROVISIONING;
  }

  return (data as ProvisioningOverride | null) ?? DEFAULT_PROVISIONING;
}

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return NextResponse.json(
      { error: "Missing svix headers" },
      { status: 400 }
    );
  }

  const payload = await req.text();
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: ClerkWebhookEvent;
  try {
    evt = wh.verify(payload, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as ClerkWebhookEvent;
  } catch {
    return NextResponse.json(
      { error: "Webhook verification failed" },
      { status: 400 }
    );
  }

  if (evt.type === "user.created") {
    const { id, email_addresses, first_name, last_name } = evt.data;
    const email = email_addresses[0]?.email_address ?? "";
    const fullName =
      [first_name, last_name].filter(Boolean).join(" ") || "New User";

    const provisioning = await getProvisioning(email);

    // Create profile row, pre-seeded with any allowlisted preferences and
    // resume content so tailoring isn't blocked on an empty profile
    await getSupabase().from("profiles").insert({
      clerk_user_id: id,
      full_name: fullName,
      email,
      preferences: provisioning.preferences,
      ...pickSeedableProfileFields(provisioning.profile),
    });

    // Create cost config (AI dollar cap is the only real spend gate)
    await getSupabase().from("cost_config").insert({
      clerk_user_id: id,
      monthly_ai_cap_usd: provisioning.monthly_ai_cap_usd,
      block_on_cap: provisioning.block_on_cap,
    });

    // Create subscription for metering
    await getSupabase().from("subscriptions").insert({
      clerk_user_id: id,
      plan_type: provisioning.plan_type,
      applications_cap: PLAN_CONFIG[provisioning.plan_type].applicationsCap,
    });

    // Record that the override was consumed (best effort -- never blocks signup)
    if (provisioning !== DEFAULT_PROVISIONING) {
      await getSupabase()
        .from("provisioning_overrides")
        .update({ applied_at: new Date().toISOString() })
        .eq("email", email.toLowerCase());
    }
  }

  return NextResponse.json({ received: true });
}
