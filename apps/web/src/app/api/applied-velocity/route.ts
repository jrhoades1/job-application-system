import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";
import {
  resolveWindow,
  toDateOnly,
  type VelocityWindow,
} from "@/lib/date-windows";

const VALID_WINDOWS: VelocityWindow[] = ["today", "week", "month", "ytd", "all"];

export interface AppliedVelocityResponse {
  window: VelocityWindow;
  count: number;
  prev_count: number | null;
  delta: number | null;
  most_recent: string | null;
  series: { bucket: string; count: number }[];
  range: { start: string | null; end: string };
}

export async function GET(req: Request) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const { searchParams } = new URL(req.url);

    const rawWindow = (searchParams.get("window") ?? "week").toLowerCase();
    const win = (VALID_WINDOWS as string[]).includes(rawWindow)
      ? (rawWindow as VelocityWindow)
      : "week";

    const range = resolveWindow(win);

    // Pull only applied_date; small column, covers both series + count.
    // prevStart is the earliest date we need (so prior-period delta works).
    // For "all", we need everything — no lower bound.
    let query = supabase
      .from("applications")
      .select("applied_date")
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .not("applied_date", "is", null);

    const fetchFrom = range.prevStart ?? range.start;
    if (fetchFrom) {
      query = query.gte("applied_date", toDateOnly(fetchFrom));
    }
    query = query.lt("applied_date", toDateOnly(range.end));

    // Also grab the most-recent applied_date across ALL time (separate query — cheap).
    const [rowsRes, mostRecentRes] = await Promise.all([
      query,
      supabase
        .from("applications")
        .select("applied_date")
        .eq("clerk_user_id", userId)
        .is("deleted_at", null)
        .not("applied_date", "is", null)
        .order("applied_date", { ascending: false })
        .limit(1),
    ]);

    if (rowsRes.error) {
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    const rows = (rowsRes.data ?? []) as { applied_date: string }[];

    // Count current window
    const startStr = range.start ? toDateOnly(range.start) : null;
    const endStr = toDateOnly(range.end);
    const prevStartStr = range.prevStart ? toDateOnly(range.prevStart) : null;
    const prevEndStr = range.prevEnd ? toDateOnly(range.prevEnd) : null;

    let count = 0;
    let prevCount = 0;
    const seriesMap = new Map<string, number>();

    for (const row of rows) {
      const d = row.applied_date;
      if (!d) continue;

      // Current window
      if ((startStr === null || d >= startStr) && d < endStr) {
        count++;
        const bucketKey =
          range.bucket === "month" ? d.slice(0, 7) : d; // "YYYY-MM" or "YYYY-MM-DD"
        seriesMap.set(bucketKey, (seriesMap.get(bucketKey) ?? 0) + 1);
      }

      // Previous equivalent window (if defined)
      if (
        prevStartStr !== null &&
        prevEndStr !== null &&
        d >= prevStartStr &&
        d < prevEndStr
      ) {
        prevCount++;
      }
    }

    // Build ordered series — fill empty buckets with 0 so sparklines don't jitter.
    const series: { bucket: string; count: number }[] = [];
    if (range.bucket === "day" && range.start) {
      for (let i = 0; i < range.bucketCount; i++) {
        const day = new Date(range.start.getTime() + i * 86400000);
        const key = toDateOnly(day);
        if (key >= endStr) break;
        series.push({ bucket: key, count: seriesMap.get(key) ?? 0 });
      }
    } else if (range.bucket === "month" && range.start) {
      const startYear = range.start.getUTCFullYear();
      const startMonth = range.start.getUTCMonth();
      for (let i = 0; i < range.bucketCount; i++) {
        const d = new Date(Date.UTC(startYear, startMonth + i, 1));
        const key = toDateOnly(d).slice(0, 7);
        series.push({ bucket: key, count: seriesMap.get(key) ?? 0 });
      }
    } else {
      // "all" — emit sorted buckets from the map (monthly) so the chart has something useful.
      const keys = Array.from(seriesMap.keys()).sort();
      for (const k of keys) {
        series.push({ bucket: k, count: seriesMap.get(k) ?? 0 });
      }
    }

    const mostRecent =
      (mostRecentRes.data?.[0] as { applied_date: string } | undefined)?.applied_date ?? null;

    const response: AppliedVelocityResponse = {
      window: win,
      count,
      prev_count: prevStartStr ? prevCount : null,
      delta: prevStartStr ? count - prevCount : null,
      most_recent: mostRecent,
      series,
      range: { start: startStr, end: endStr },
    };

    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
