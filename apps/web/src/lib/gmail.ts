/**
 * Gmail OAuth helpers — token management, API calls, email text extraction.
 * Used by /api/gmail/* routes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface GmailTokens {
  access_token: string;
  refresh_token: string;
  expiry: number; // Unix ms
}

export interface GmailMessage {
  id: string;
  threadId: string;
}

export interface GmailMessageFull {
  id: string;
  payload: {
    headers: { name: string; value: string }[];
    parts?: GmailPart[];
    body?: { data?: string };
    mimeType: string;
  };
  internalDate: string;
}

interface GmailPart {
  mimeType: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

const GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";

/**
 * Load tokens from email_connections table. Auto-refresh if expired.
 * Returns null if no connection exists.
 */
export async function getGmailTokens(
  supabase: SupabaseClient,
  userId: string
): Promise<GmailTokens | null> {
  const { data } = await supabase
    .from("email_connections")
    .select("oauth_token")
    .eq("clerk_user_id", userId)
    .eq("is_active", true)
    .single();

  if (!data?.oauth_token) return null;

  let tokens: GmailTokens;
  try {
    tokens = JSON.parse(data.oauth_token);
  } catch {
    return null;
  }

  // Refresh if expired or within 5 minutes of expiry
  if (Date.now() >= tokens.expiry - 5 * 60 * 1000) {
    const refreshed = await refreshAccessToken(tokens.refresh_token);
    if (!refreshed) return null;

    tokens = { ...refreshed, refresh_token: tokens.refresh_token };

    // Persist refreshed tokens
    await supabase
      .from("email_connections")
      .update({ oauth_token: JSON.stringify(tokens) })
      .eq("clerk_user_id", userId);
  }

  return tokens;
}

/**
 * Exchange a refresh token for a new access token via Google's token endpoint.
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<Pick<GmailTokens, "access_token" | "expiry"> | null> {
  const res = await fetch(GMAIL_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) return null;

  const data = await res.json();
  return {
    access_token: data.access_token,
    expiry: Date.now() + data.expires_in * 1000,
  };
}

/**
 * Exchange an authorization code for access + refresh tokens.
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<GmailTokens | null> {
  const res = await fetch(GMAIL_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) return null;

  const data = await res.json();
  if (!data.refresh_token) return null; // Need offline access

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry: Date.now() + data.expires_in * 1000,
  };
}

/**
 * Fetch the authenticated user's email address from Gmail profile.
 */
export async function getGmailEmailAddress(
  accessToken: string
): Promise<string | null> {
  const res = await fetch(`${GMAIL_API}/users/me/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.emailAddress ?? null;
}

/**
 * List message IDs matching a query (e.g. "newer_than:7d").
 * Returns up to maxResults message IDs.
 */
export async function listGmailMessages(
  accessToken: string,
  query: string,
  maxResults = 100
): Promise<GmailMessage[]> {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
  });

  const res = await fetch(
    `${GMAIL_API}/users/me/messages?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) return [];
  const data = await res.json();
  return data.messages ?? [];
}

/**
 * Fetch a full Gmail message by ID.
 */
export async function getGmailMessage(
  accessToken: string,
  messageId: string
): Promise<GmailMessageFull | null> {
  const res = await fetch(
    `${GMAIL_API}/users/me/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return null;
  return res.json();
}

/**
 * Extract header value by name from a Gmail message.
 */
export function getHeader(msg: GmailMessageFull, name: string): string {
  return (
    msg.payload.headers.find(
      (h) => h.name.toLowerCase() === name.toLowerCase()
    )?.value ?? ""
  );
}

/**
 * Recursively extract plain text body from Gmail message parts.
 * Prefers text/plain over text/html.
 */
export function extractEmailText(msg: GmailMessageFull): string {
  const text = extractTextFromParts(msg.payload);
  return text.trim();
}

function extractTextFromParts(part: {
  mimeType: string;
  body?: { data?: string };
  parts?: GmailPart[];
}): string {
  if (part.mimeType === "text/plain" && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }

  if (part.mimeType === "text/html" && part.body?.data) {
    // Strip HTML tags as fallback
    const html = decodeBase64Url(part.body.data);
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  }

  if (part.parts) {
    // Prefer text/plain child first
    const plainPart = part.parts.find((p) => p.mimeType === "text/plain");
    if (plainPart) return extractTextFromParts(plainPart);

    // Recurse through all parts
    for (const child of part.parts) {
      const text = extractTextFromParts(child);
      if (text) return text;
    }
  }

  return "";
}

function decodeBase64Url(data: string): string {
  // Gmail uses URL-safe base64 (replace - with + and _ with /)
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Buffer.from(base64, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

/**
 * SHA-256 fingerprint of an email for deduplication.
 */
export async function computeEmailFingerprint(
  from: string,
  subject: string,
  bodyPreview: string
): Promise<string> {
  const input = `${from}|${subject}|${bodyPreview.slice(0, 500)}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
