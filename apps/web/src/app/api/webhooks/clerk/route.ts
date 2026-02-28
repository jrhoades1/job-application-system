import { Webhook } from "svix";
import { headers } from "next/headers";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

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

    // Create profile row
    await getSupabase().from("profiles").insert({
      clerk_user_id: id,
      full_name: fullName,
      email,
    });

    // Create default cost config
    await getSupabase().from("cost_config").insert({
      clerk_user_id: id,
    });
  }

  return NextResponse.json({ received: true });
}
