/**
 * Decay Engine — auto-transitions stale applications and pipeline leads.
 *
 * Runs as part of the nightly pipeline cron. For each application in a
 * decayable status, computes how long it's been in that status using
 * application_status_history (fallback: created_at). If past the
 * autoDays threshold, transitions the record and logs the change.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { DECAY_RULES, DECAYABLE_STATUSES } from "./decay-rules";

interface DecayDetail {
  applicationId: string;
  company: string;
  role: string;
  status: string;
  daysInStatus: number;
  action: string;
}

export interface DecayResult {
  processed: number;
  autoArchived: number;
  details: DecayDetail[];
}

interface ApplicationRow {
  id: string;
  company: string;
  role: string;
  status: string;
  created_at: string;
  follow_up_date: string | null;
}

interface StatusHistoryRow {
  application_id: string;
  changed_at: string;
}

/**
 * Run the decay engine for a single user.
 * Returns counts of processed and auto-archived records.
 */
export async function runDecayEngine(
  supabase: SupabaseClient,
  userId: string
): Promise<DecayResult> {
  const result: DecayResult = {
    processed: 0,
    autoArchived: 0,
    details: [],
  };

  const now = new Date();

  // 1. Fetch all applications in decayable statuses
  const { data: apps, error: appsError } = await supabase
    .from("applications")
    .select("id, company, role, status, created_at, follow_up_date")
    .eq("clerk_user_id", userId)
    .is("deleted_at", null)
    .in("status", DECAYABLE_STATUSES);

  if (appsError || !apps || apps.length === 0) {
    return result;
  }

  const typedApps = apps as ApplicationRow[];

  // 2. Fetch the most recent status_history entry for each app
  //    (when it entered its current status)
  const appIds = typedApps.map((a) => a.id);
  const { data: historyRows } = await supabase
    .from("application_status_history")
    .select("application_id, changed_at")
    .in("application_id", appIds)
    .order("changed_at", { ascending: false });

  // Build a map: applicationId -> most recent changed_at
  const enteredAtMap = new Map<string, string>();
  for (const row of (historyRows ?? []) as StatusHistoryRow[]) {
    // First row per app_id is the most recent (ordered desc)
    if (!enteredAtMap.has(row.application_id)) {
      enteredAtMap.set(row.application_id, row.changed_at);
    }
  }

  // 3. Process each application against its decay rule
  for (const app of typedApps) {
    const rule = DECAY_RULES[app.status];
    if (!rule) continue;

    // Determine when the app entered its current status
    const enteredAt = enteredAtMap.get(app.id) ?? app.created_at;

    // For interviewing apps, the follow_up_date acts as a heartbeat.
    // If follow_up_date is in the future or recently passed, the app is alive.
    // Decay clock starts from the later of: entered_at or follow_up_date.
    let decayAnchor = enteredAt;
    if (app.status === "interviewing" && app.follow_up_date) {
      const followUp = new Date(app.follow_up_date).getTime();
      const entered = new Date(enteredAt).getTime();
      if (followUp > entered) {
        decayAnchor = app.follow_up_date;
      }
    }

    const daysInStatus = Math.floor(
      (now.getTime() - new Date(decayAnchor).getTime()) / (24 * 60 * 60 * 1000)
    );

    result.processed++;

    // Only auto-transition if past autoDays
    if (daysInStatus < rule.autoDays) continue;

    // 4. Transition the application
    if (rule.targetAppStatus) {
      const updateData: Record<string, string> = {
        status: rule.targetAppStatus,
      };
      // Set rejection_date for withdrawn records so we know when it happened
      if (rule.targetAppStatus === "withdrawn") {
        updateData.skip_date = now.toISOString().split("T")[0];
        updateData.skip_reason = `Auto-${rule.autoAction}: ${daysInStatus} days in "${app.status}"`;
      }

      await supabase
        .from("applications")
        .update(updateData)
        .eq("id", app.id)
        .eq("clerk_user_id", userId);
    }

    // 5. Also update pipeline_leads if applicable (pending_review -> auto_skipped)
    if (rule.targetLeadStatus) {
      await supabase
        .from("pipeline_leads")
        .update({
          status: rule.targetLeadStatus,
          skip_reason: `Auto-decay: ${daysInStatus} days without review`,
        })
        .eq("clerk_user_id", userId)
        .eq("status", "pending_review")
        .eq("company", app.company)
        .eq("role", app.role);
    }

    // 6. Record in status history
    await supabase.from("application_status_history").insert({
      application_id: app.id,
      clerk_user_id: userId,
      from_status: app.status,
      to_status: rule.targetAppStatus ?? app.status,
      source: "decay_engine",
    });

    result.autoArchived++;
    result.details.push({
      applicationId: app.id,
      company: app.company,
      role: app.role,
      status: app.status,
      daysInStatus,
      action: rule.autoAction,
    });
  }

  if (result.autoArchived > 0) {
    console.log(
      `[decay-engine] User ${userId}: archived ${result.autoArchived}/${result.processed} stale records`
    );
  }

  return result;
}
