import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

export async function GET() {
  try {
    const { userId } = await getAuthenticatedClient();

    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    const clientId = process.env.GOOGLE_CLIENT_ID;

    if (!redirectUri || !clientId) {
      return NextResponse.json(
        { error: "Gmail OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI." },
        { status: 500 }
      );
    }

    // Encode clerk userId in state param for CSRF validation in callback
    const state = Buffer.from(JSON.stringify({ userId, ts: Date.now() })).toString(
      "base64url"
    );

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES,
      access_type: "offline",
      prompt: "consent", // Always ask for consent to ensure we get a refresh_token
      state,
    });

    return NextResponse.redirect(`${GOOGLE_AUTH_URL}?${params}`);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
