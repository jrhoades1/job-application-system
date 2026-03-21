/**
 * GET /api/digest
 *
 * Returns the most recent digest run for the authenticated user.
 * Used by the Today page to show the morning digest banner.
 */

import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";

export interface DigestLead {
  id: string;
  company: string;
  role: string;
  score_overall: string | null;
  score_match_percentage: number | null;
  career_page_url: string | null;
  location: string | null;
}

export interface DigestRun {
  id: string;
  run_date: string;
  emails_fetched: number;
  leads_created: number;
  above_threshold: number;
  top_leads: DigestLead[];
  digest_sent_at: string | null;
  created_at: string;
}

export async function GET() {
  try {
    const { supabase, userId } = await getAuthenticatedClient();

    // Return the most recent digest run (last 7 days)
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const { data, error } = await supabase
      .from("digest_runs")
      .select("*")
      .eq("clerk_user_id", userId)
      .gte("run_date", since.toISOString().split("T")[0])
      .order("run_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
