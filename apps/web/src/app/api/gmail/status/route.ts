import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";

export interface GmailStatus {
  email_address: string;
  last_fetch_at: string | null;
  is_active: boolean;
  health: "ok" | "stale" | "refresh_failing" | "disconnected";
  refresh_failure_count: number;
  last_refresh_error: string | null;
  last_refresh_error_at: string | null;
}

export async function GET() {
  try {
    const { supabase, userId } = await getAuthenticatedClient();

    const { data } = await supabase
      .from("email_connections")
      .select(
        "email_address, last_fetch_at, is_active, refresh_failure_count, last_refresh_error, last_refresh_error_at"
      )
      .eq("clerk_user_id", userId)
      .maybeSingle();

    if (!data) {
      return NextResponse.json(null);
    }

    if (!data.is_active) {
      const payload: GmailStatus = {
        email_address: data.email_address,
        last_fetch_at: data.last_fetch_at ?? null,
        is_active: false,
        health: "disconnected",
        refresh_failure_count: data.refresh_failure_count ?? 0,
        last_refresh_error: data.last_refresh_error ?? null,
        last_refresh_error_at: data.last_refresh_error_at ?? null,
      };
      return NextResponse.json(payload);
    }

    // Classify health:
    //  - refresh_failing: any refresh_failure_count > 0 AND the last error
    //    happened within the last 6 hours (we're actively broken).
    //  - stale: last successful fetch was >24h ago but no refresh error.
    //  - ok: everything is healthy.
    let health: GmailStatus["health"] = "ok";
    const now = Date.now();
    const failCount = data.refresh_failure_count ?? 0;
    const lastErrAt = data.last_refresh_error_at
      ? new Date(data.last_refresh_error_at).getTime()
      : null;
    const lastFetchAt = data.last_fetch_at
      ? new Date(data.last_fetch_at).getTime()
      : null;

    if (failCount > 0 && lastErrAt && now - lastErrAt < 6 * 60 * 60 * 1000) {
      health = "refresh_failing";
    } else if (!lastFetchAt || now - lastFetchAt > 24 * 60 * 60 * 1000) {
      health = "stale";
    }

    const payload: GmailStatus = {
      email_address: data.email_address,
      last_fetch_at: data.last_fetch_at,
      is_active: true,
      health,
      refresh_failure_count: failCount,
      last_refresh_error: data.last_refresh_error ?? null,
      last_refresh_error_at: data.last_refresh_error_at ?? null,
    };
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(null);
  }
}
