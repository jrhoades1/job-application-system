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
    const result = await refreshAccessToken(tokens.refresh_token);
    const nowIso = new Date().toISOString();

    if (result.kind === "revoked") {
      // Refresh token is permanently invalid — user must re-auth.
      console.error("[gmail] refresh token revoked:", result.error);
      const { data: current } = await supabase
        .from("email_connections")
        .select("refresh_failure_count")
        .eq("clerk_user_id", userId)
        .single();
      await supabase
        .from("email_connections")
        .update({
          is_active: false,
          last_refresh_error: result.error.slice(0, 2000),
          last_refresh_error_kind: "revoked",
          last_refresh_error_at: nowIso,
          refresh_failure_count: (current?.refresh_failure_count ?? 0) + 1,
        })
        .eq("clerk_user_id", userId);
      return null;
    }

    if (result.kind === "transient") {
      // Transient failure (network, 5xx, timeout). Do NOT deactivate —
      // keep the connection so the next request can retry.
      console.warn("[gmail] transient refresh failure, preserving connection:", result.error);
      const { data: current } = await supabase
        .from("email_connections")
        .select("refresh_failure_count")
        .eq("clerk_user_id", userId)
        .single();
      await supabase
        .from("email_connections")
        .update({
          last_refresh_error: result.error.slice(0, 2000),
          last_refresh_error_kind: "transient",
          last_refresh_error_at: nowIso,
          refresh_failure_count: (current?.refresh_failure_count ?? 0) + 1,
        })
        .eq("clerk_user_id", userId);
      return null;
    }

    tokens = { ...result.tokens, refresh_token: tokens.refresh_token };

    // Persist refreshed tokens and clear any prior error state
    await supabase
      .from("email_connections")
      .update({
        oauth_token: JSON.stringify(tokens),
        last_refresh_error: null,
        last_refresh_error_kind: null,
        last_refresh_error_at: null,
        refresh_failure_count: 0,
      })
      .eq("clerk_user_id", userId);
  }

  return tokens;
}

export type RefreshResult =
  | { kind: "ok"; tokens: Pick<GmailTokens, "access_token" | "expiry"> }
  | { kind: "revoked"; error: string }
  | { kind: "transient"; error: string };

/**
 * Exchange a refresh token for a new access token via Google's token endpoint.
 * Distinguishes permanent revocation (invalid_grant) from transient failures
 * so callers can avoid nuking the connection on network blips.
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<RefreshResult> {
  let res: Response;
  try {
    res = await fetch(GMAIL_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
  } catch (err) {
    return { kind: "transient", error: `fetch failed: ${String(err)}` };
  }

  if (res.ok) {
    const data = await res.json();
    if (!data.access_token || typeof data.expires_in !== "number") {
      return { kind: "transient", error: "malformed token response" };
    }
    return {
      kind: "ok",
      tokens: {
        access_token: data.access_token,
        expiry: Date.now() + data.expires_in * 1000,
      },
    };
  }

  const body = await res.text().catch(() => "");

  // Parse Google's JSON error envelope so we capture `error_description`
  // (e.g. "Token has been expired or revoked.") in diagnostics.
  let parsed: { error?: string; error_description?: string } | null = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = null;
  }
  const errorCode = parsed?.error ?? "";
  const errorDescription = parsed?.error_description ?? "";
  const summary = `${res.status} ${errorCode}${errorDescription ? `: ${errorDescription}` : ""}`.trim();

  // Google returns 400 with {"error":"invalid_grant"} when the refresh token
  // is revoked, expired, or was issued to a different client. Only these
  // cases should deactivate the connection.
  if ((res.status === 400 || res.status === 401) && /invalid_grant/i.test(errorCode || body)) {
    return { kind: "revoked", error: summary || `${res.status}: ${body}` };
  }

  // 5xx, 429, network errors, and anything else we can't classify as
  // permanent — treat as transient and keep the connection.
  return { kind: "transient", error: summary || `${res.status}: ${body}` };
}

/**
 * Exchange an authorization code for access + refresh tokens.
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<GmailTokens | null> {
  console.log("[gmail] exchangeCodeForTokens — redirect_uri:", redirectUri);
  console.log("[gmail] client_id present:", !!process.env.GOOGLE_CLIENT_ID);
  console.log("[gmail] client_secret present:", !!process.env.GOOGLE_CLIENT_SECRET);

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

  if (!res.ok) {
    const errBody = await res.text();
    console.error("[gmail] token exchange failed:", res.status, errBody);
    return null;
  }

  const data = await res.json();
  if (!data.refresh_token) {
    console.error("[gmail] no refresh_token in response — missing access_type=offline?", Object.keys(data));
    return null;
  }

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

  if (!res.ok) {
    console.error("[gmail] listMessages failed:", res.status, await res.text().catch(() => ""));
    return [];
  }
  const data = await res.json();
  console.log("[gmail] listMessages:", data.resultSizeEstimate ?? 0, "results for query:", query);
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
 * Get or create a Gmail label by name. Returns the label ID.
 */
export async function getOrCreateLabel(
  accessToken: string,
  labelName: string
): Promise<string | null> {
  // List existing labels
  const listRes = await fetch(`${GMAIL_API}/users/me/labels`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listRes.ok) return null;
  const { labels } = await listRes.json();
  const existing = labels?.find(
    (l: { name: string; id: string }) => l.name === labelName
  );
  if (existing) return existing.id;

  // Create label
  const createRes = await fetch(`${GMAIL_API}/users/me/labels`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: labelName,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    }),
  });
  if (!createRes.ok) return null;
  const created = await createRes.json();
  return created.id;
}

/**
 * Apply a label to a Gmail message.
 */
export async function labelMessage(
  accessToken: string,
  messageId: string,
  labelId: string
): Promise<boolean> {
  const res = await fetch(
    `${GMAIL_API}/users/me/messages/${messageId}/modify`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ addLabelIds: [labelId] }),
    }
  );
  return res.ok;
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
