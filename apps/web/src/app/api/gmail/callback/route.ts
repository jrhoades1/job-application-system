import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";
import {
  exchangeCodeForTokens,
  getGmailEmailAddress,
} from "@/lib/gmail";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?gmail=denied", req.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?gmail=error&code=noparams", req.url)
    );
  }

  try {
    // Validate state — decode userId
    let stateData: { userId: string; ts: number };
    try {
      stateData = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
    } catch {
      return NextResponse.redirect(
        new URL("/dashboard/settings?gmail=error&code=state", req.url)
      );
    }

    // State must not be older than 10 minutes
    if (Date.now() - stateData.ts > 10 * 60 * 1000) {
      return NextResponse.redirect(
        new URL("/dashboard/settings?gmail=error&code=expired", req.url)
      );
    }

    const { supabase, userId } = await getAuthenticatedClient();

    // Confirm the state userId matches the logged-in user
    if (stateData.userId !== userId) {
      return NextResponse.redirect(
        new URL("/dashboard/settings?gmail=error&code=mismatch", req.url)
      );
    }

    const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? "";
    const tokens = await exchangeCodeForTokens(code, redirectUri);

    if (!tokens) {
      return NextResponse.redirect(
        new URL("/dashboard/settings?gmail=error&code=token", req.url)
      );
    }

    const emailAddress = await getGmailEmailAddress(tokens.access_token);

    // Upsert into email_connections
    const { error: dbError } = await supabase.from("email_connections").upsert(
      {
        clerk_user_id: userId,
        email_address: emailAddress ?? "",
        oauth_token: JSON.stringify(tokens),
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "clerk_user_id" }
    );

    if (dbError) {
      console.error("Gmail db error:", dbError);
      return NextResponse.redirect(
        new URL("/dashboard/settings?gmail=error&code=db", req.url)
      );
    }

    return NextResponse.redirect(
      new URL("/dashboard/settings?gmail=connected", req.url)
    );
  } catch (err) {
    console.error("Gmail callback error:", err);
    return NextResponse.redirect(
      new URL("/dashboard/settings?gmail=error&code=exception", req.url)
    );
  }
}
