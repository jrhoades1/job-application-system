import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";
import { DECAY_RULES, DECAYABLE_STATUSES, IMMINENT_THRESHOLD_DAYS } from "@/lib/decay-rules";

export interface TodayAction {
  id: string;
  type:
    | "interview_soon"
    | "overdue_followup"
    | "debrief_needed"
    | "new_leads"
    | "followup_due_today"
    | "needs_first_followup"
    | "find_referral"
    | "ready_to_apply"
    | "stalled"
    | "followup_this_week"
    | "decay_warning"
    | "decay_imminent"
    | "decay_summary"
    | "insight";
  priority: "urgent" | "today" | "week";
  company: string;
  role: string;
  action_label: string;
  action_url: string;
  detail: string;
  due_date: string | null;
  decay_deadline?: string | null;
}

interface InterviewRound {
  round: number;
  date: string;
  status: string;
  type?: string;
}

function trackerUrl(id: string, actionType: string, detail: string) {
  return `/dashboard/tracker/${id}?action=${actionType}&detail=${encodeURIComponent(detail)}`;
}

// Prefixes for action ids whose first UUID segment is the application id.
// Kept in sync with extractAppId() on the client (dashboard/page.tsx).
const APP_ID_PREFIXES = [
  "interview-", "overdue-", "debrief-", "followup-today-", "first-followup-",
  "referral-", "ready-", "stalled-", "followup-week-", "decay-",
];

function extractAppId(actionId: string): string | null {
  for (const p of APP_ID_PREFIXES) {
    if (actionId.startsWith(p)) {
      // Strip known suffixes like `-${round}` on interview/debrief.
      const rest = actionId.slice(p.length);
      const firstDash = rest.indexOf("-", 36); // UUIDs are 36 chars
      return firstDash === -1 ? rest : rest.slice(0, firstDash);
    }
  }
  return null;
}

function collectAppIds(actions: TodayAction[]): Set<string> {
  const out = new Set<string>();
  for (const a of actions) {
    const id = extractAppId(a.id);
    if (id) out.add(id);
  }
  return out;
}

// Priority ordering for per-app dedup: a more specific CTA beats a generic
// decay/follow-up warning for the same application. Lower = wins.
const TYPE_SPECIFICITY: Record<TodayAction["type"], number> = {
  interview_soon: 0,
  debrief_needed: 1,
  overdue_followup: 2,
  followup_due_today: 3,
  needs_first_followup: 4,
  find_referral: 5,
  ready_to_apply: 6,
  stalled: 7,
  decay_imminent: 8,
  followup_this_week: 9,
  decay_warning: 10,
  new_leads: 11,
  decay_summary: 12,
  insight: 13,
};

const PRIORITY_RANK = { urgent: 0, today: 1, week: 2 } as const;

function dedupeByApp(actions: TodayAction[]): TodayAction[] {
  const bestByApp = new Map<string, TodayAction>();
  const passthrough: TodayAction[] = [];
  for (const a of actions) {
    const appId = extractAppId(a.id);
    if (!appId) {
      passthrough.push(a); // pipeline-leads, insights, decay-summary
      continue;
    }
    const existing = bestByApp.get(appId);
    if (!existing || isMoreSpecific(a, existing)) {
      bestByApp.set(appId, a);
    }
  }
  return [...passthrough, ...bestByApp.values()];
}

function isMoreSpecific(a: TodayAction, b: TodayAction): boolean {
  const pa = PRIORITY_RANK[a.priority];
  const pb = PRIORITY_RANK[b.priority];
  if (pa !== pb) return pa < pb;
  return TYPE_SPECIFICITY[a.type] < TYPE_SPECIFICITY[b.type];
}

export async function GET() {
  try {
    const { supabase, userId } = await getAuthenticatedClient();

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const ago5d = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const ago7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const ago21d = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const [
      interviewingRes,
      overdueFollowupsRes,
      debriefRes,
      pipelineRes,
      needsFirstFollowupRes,
      followupTodayRes,
      readyToApplyRes,
      stalledRes,
      followupWeekRes,
      decayableRes,
      decayHistoryRes,
      referralPendingRes,
    ] = await Promise.all([
      // Interviewing apps (check JSONB for upcoming interviews)
      supabase
        .from("applications")
        .select("id, company, role, interviews")
        .eq("clerk_user_id", userId)
        .is("deleted_at", null)
        .eq("status", "interviewing")
        .not("interviews", "eq", "[]"),

      // Overdue follow-ups (exclude terminal statuses)
      supabase
        .from("applications")
        .select("id, company, role, follow_up_date, status")
        .eq("clerk_user_id", userId)
        .is("deleted_at", null)
        .not("follow_up_date", "is", null)
        .lt("follow_up_date", todayStr)
        .not("status", "in", '("withdrawn","rejected","accepted")'),

      // Debriefs needed (past scheduled interviews)
      supabase
        .from("applications")
        .select("id, company, role, interviews")
        .eq("clerk_user_id", userId)
        .is("deleted_at", null)
        .not("interviews", "eq", "[]"),

      // Pipeline leads pending review (count)
      supabase
        .from("pipeline_leads")
        .select("id", { count: "exact", head: true })
        .eq("clerk_user_id", userId)
        .eq("status", "pending_review")
        .is("deleted_at", null),

      // Applied 5-7 days ago, no follow_up_date set (needs first follow-up)
      supabase
        .from("applications")
        .select("id, company, role, applied_date")
        .eq("clerk_user_id", userId)
        .is("deleted_at", null)
        .eq("status", "applied")
        .is("follow_up_date", null)
        .lte("applied_date", ago5d)
        .gte("applied_date", ago7d),

      // Follow-ups due today (exclude terminal statuses)
      supabase
        .from("applications")
        .select("id, company, role, follow_up_date")
        .eq("clerk_user_id", userId)
        .is("deleted_at", null)
        .eq("follow_up_date", todayStr)
        .not("status", "in", '("withdrawn","rejected","accepted")'),

      // Ready to apply (evaluating or ready_to_apply)
      supabase
        .from("applications")
        .select("id, company, role, status")
        .eq("clerk_user_id", userId)
        .is("deleted_at", null)
        .in("status", ["evaluating", "ready_to_apply"]),

      // Stalled (applied 21+ days ago)
      supabase
        .from("applications")
        .select("id, company, role, applied_date")
        .eq("clerk_user_id", userId)
        .is("deleted_at", null)
        .eq("status", "applied")
        .lt("applied_date", ago21d),

      // Follow-ups coming this week (tomorrow through +7 days, exclude terminal statuses)
      supabase
        .from("applications")
        .select("id, company, role, follow_up_date")
        .eq("clerk_user_id", userId)
        .is("deleted_at", null)
        .not("follow_up_date", "is", null)
        .gt("follow_up_date", todayStr)
        .lte("follow_up_date", in7d)
        .not("status", "in", '("withdrawn","rejected","accepted")'),

      // Decayable applications (for decay warnings)
      supabase
        .from("applications")
        .select("id, company, role, status, created_at, follow_up_date")
        .eq("clerk_user_id", userId)
        .is("deleted_at", null)
        .in("status", DECAYABLE_STATUSES),

      // Status history for decay age calculation
      supabase
        .from("application_status_history")
        .select("application_id, changed_at")
        .eq("clerk_user_id", userId)
        .order("changed_at", { ascending: false }),

      // Referral pending — only surface for apps applied in the last 7 days.
      // Referral-hunting ROI drops fast after the first week; older pending
      // rows get auto-skipped during decay handling instead of cluttering Today.
      supabase
        .from("applications")
        .select("id, company, role, applied_date")
        .eq("clerk_user_id", userId)
        .is("deleted_at", null)
        .eq("referral_status", "pending")
        .gte("applied_date", ago7d)
        .not("status", "in", '("withdrawn","rejected","accepted")'),
    ]);

    const actions: TodayAction[] = [];

    // URGENT: Interviews within 48 hours
    for (const app of interviewingRes.data ?? []) {
      const interviews = (app.interviews ?? []) as InterviewRound[];
      for (const iv of interviews) {
        if (
          iv.status === "scheduled" &&
          iv.date &&
          iv.date >= todayStr &&
          iv.date <= in48h
        ) {
          actions.push({
            id: `interview-${app.id}-${iv.round}`,
            type: "interview_soon",
            priority: "urgent",
            company: app.company,
            role: app.role,
            action_label: "Prepare",
            action_url: trackerUrl(app.id, "interview_soon", `${iv.type ?? "Interview"} R${iv.round} on ${iv.date}`),
            detail: `${iv.type ?? "Interview"} R${iv.round} on ${iv.date}`,
            due_date: iv.date,
          });
        }
      }
    }

    // URGENT: Overdue follow-ups
    for (const app of overdueFollowupsRes.data ?? []) {
      const daysOverdue = Math.floor(
        (now.getTime() - new Date(app.follow_up_date!).getTime()) /
          (24 * 60 * 60 * 1000)
      );
      actions.push({
        id: `overdue-${app.id}`,
        type: "overdue_followup",
        priority: "urgent",
        company: app.company,
        role: app.role,
        action_label: "Follow up",
        action_url: trackerUrl(app.id, "overdue_followup", `${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} overdue`),
        detail: `${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} overdue`,
        due_date: app.follow_up_date,
      });
    }

    // URGENT: Debriefs needed
    for (const app of debriefRes.data ?? []) {
      const interviews = (app.interviews ?? []) as InterviewRound[];
      for (const iv of interviews) {
        if (iv.status === "scheduled" && iv.date && iv.date < todayStr) {
          actions.push({
            id: `debrief-${app.id}-${iv.round}`,
            type: "debrief_needed",
            priority: "urgent",
            company: app.company,
            role: app.role,
            action_label: "Debrief",
            action_url: trackerUrl(app.id, "debrief_needed", `${iv.type ?? "Interview"} R${iv.round} on ${iv.date} - update status`),
            detail: `${iv.type ?? "Interview"} R${iv.round} on ${iv.date} — update status`,
            due_date: iv.date,
          });
        }
      }
    }

    // TODAY: New pipeline leads
    const leadCount = pipelineRes.count ?? 0;
    if (leadCount > 0) {
      actions.push({
        id: "pipeline-leads",
        type: "new_leads",
        priority: "today",
        company: "",
        role: "",
        action_label: "Review leads",
        action_url: "/dashboard/jobs?tab=leads",
        detail: `${leadCount} new lead${leadCount !== 1 ? "s" : ""} from email`,
        due_date: null,
      });
    }

    // TODAY: Follow-ups due today
    for (const app of followupTodayRes.data ?? []) {
      actions.push({
        id: `followup-today-${app.id}`,
        type: "followup_due_today",
        priority: "today",
        company: app.company,
        role: app.role,
        action_label: "Follow up",
        action_url: trackerUrl(app.id, "followup_due_today", "Follow-up scheduled for today"),
        detail: "Follow-up scheduled for today",
        due_date: app.follow_up_date,
      });
    }

    // TODAY: Needs first follow-up (applied 5-7 days ago, no follow-up set)
    for (const app of needsFirstFollowupRes.data ?? []) {
      actions.push({
        id: `first-followup-${app.id}`,
        type: "needs_first_followup",
        priority: "today",
        company: app.company,
        role: app.role,
        action_label: "Set follow-up",
        action_url: trackerUrl(app.id, "needs_first_followup", `Applied ${app.applied_date} - no follow-up scheduled`),
        detail: `Applied ${app.applied_date} — no follow-up scheduled`,
        due_date: null,
      });
    }

    // TODAY: Find a referral (applied, referral_status = pending)
    for (const app of referralPendingRes.data ?? []) {
      actions.push({
        id: `referral-${app.id}`,
        type: "find_referral",
        priority: "today",
        company: app.company,
        role: app.role,
        action_label: "Find insider",
        action_url: trackerUrl(app.id, "find_referral", `Applied ${app.applied_date ?? "recently"} - find someone inside`),
        detail: `Applied ${app.applied_date ?? "recently"} — find someone inside`,
        due_date: null,
      });
    }

    // WEEK: Ready to apply
    for (const app of readyToApplyRes.data ?? []) {
      actions.push({
        id: `ready-${app.id}`,
        type: "ready_to_apply",
        priority: "week",
        company: app.company,
        role: app.role,
        action_label: app.status === "ready_to_apply" ? "Apply" : "Review",
        action_url: trackerUrl(app.id, "ready_to_apply", app.status === "ready_to_apply" ? "Ready to submit application" : "Evaluate and decide"),
        detail:
          app.status === "ready_to_apply"
            ? "Ready to submit application"
            : "Evaluate and decide",
        due_date: null,
      });
    }

    // WEEK: Stalled applications
    for (const app of stalledRes.data ?? []) {
      const daysSince = Math.floor(
        (now.getTime() - new Date(app.applied_date!).getTime()) /
          (24 * 60 * 60 * 1000)
      );
      actions.push({
        id: `stalled-${app.id}`,
        type: "stalled",
        priority: "week",
        company: app.company,
        role: app.role,
        action_label: "Check status",
        action_url: trackerUrl(app.id, "stalled", `Applied ${daysSince} days ago - no response`),
        detail: `Applied ${daysSince} days ago — no response`,
        due_date: null,
      });
    }

    // WEEK: Follow-ups coming this week
    for (const app of followupWeekRes.data ?? []) {
      actions.push({
        id: `followup-week-${app.id}`,
        type: "followup_this_week",
        priority: "week",
        company: app.company,
        role: app.role,
        action_label: "Follow up",
        action_url: trackerUrl(app.id, "followup_this_week", `Follow-up on ${app.follow_up_date}`),
        detail: `Follow-up on ${app.follow_up_date}`,
        due_date: app.follow_up_date,
      });
    }

    // DECAY: flag apps approaching auto-archive.
    // Imminent (<= IMMINENT_THRESHOLD_DAYS to auto) stays as individual urgent cards.
    // Non-imminent warnings get collapsed into a single summary card so a bulk-
    // apply wave doesn't flood Today with dozens of identical reminders.
    const decayHistoryMap = new Map<string, string>();
    for (const row of (decayHistoryRes.data ?? []) as { application_id: string; changed_at: string }[]) {
      if (!decayHistoryMap.has(row.application_id)) {
        decayHistoryMap.set(row.application_id, row.changed_at);
      }
    }

    // Suppress a decay card when the same app already has a specific CTA above.
    const existingAppIds = collectAppIds(actions);

    type DecaySummaryRow = {
      appId: string;
      status: string;
      daysInStatus: number;
      deadlineDate: string;
    };
    const nonImminentDecay: DecaySummaryRow[] = [];

    for (const app of (decayableRes.data ?? []) as { id: string; company: string; role: string; status: string; created_at: string; follow_up_date: string | null }[]) {
      const rule = DECAY_RULES[app.status];
      if (!rule) continue;

      const enteredAt = decayHistoryMap.get(app.id) ?? app.created_at;

      // For interviewing apps, follow_up_date is the heartbeat.
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

      if (daysInStatus < rule.warnDays) continue;
      if (existingAppIds.has(app.id)) continue;

      const daysUntilAuto = rule.autoDays - daysInStatus;
      const isImminent = daysUntilAuto <= IMMINENT_THRESHOLD_DAYS;
      const deadlineDate = new Date(new Date(enteredAt).getTime() + rule.autoDays * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      if (isImminent) {
        actions.push({
          id: `decay-${app.id}`,
          type: "decay_imminent",
          priority: "urgent",
          company: app.company,
          role: app.role,
          action_label: rule.positiveLabel,
          action_url: trackerUrl(app.id, "decay_imminent", `${daysInStatus} days in "${app.status}"`),
          detail: `Auto-archive in ${daysUntilAuto} day${daysUntilAuto !== 1 ? "s" : ""} (${daysInStatus}d in "${app.status}")`,
          due_date: deadlineDate,
          decay_deadline: deadlineDate,
        });
      } else {
        nonImminentDecay.push({ appId: app.id, status: app.status, daysInStatus, deadlineDate });
      }
    }

    // Collapse into a single summary card when >3 non-imminent warnings exist;
    // keep individual cards when the list is small enough to act on directly.
    if (nonImminentDecay.length > 3) {
      const nextDeadline = nonImminentDecay
        .map((d) => d.deadlineDate)
        .sort()[0];
      actions.push({
        id: "decay-summary",
        type: "decay_summary",
        priority: "week",
        company: "",
        role: "",
        action_label: "Review",
        action_url: "/dashboard/jobs?tab=applied&filter=decay",
        detail: `${nonImminentDecay.length} applications approaching auto-archive — next on ${nextDeadline}`,
        due_date: nextDeadline,
      });
    } else {
      for (const d of nonImminentDecay) {
        const rule = DECAY_RULES[d.status]!;
        // Re-fetch a display-friendly row from the decayable list for company/role.
        const app = (decayableRes.data ?? []).find((a) => a.id === d.appId);
        if (!app) continue;
        actions.push({
          id: `decay-${d.appId}`,
          type: "decay_warning",
          priority: "today",
          company: app.company,
          role: app.role,
          action_label: rule.positiveLabel,
          action_url: trackerUrl(d.appId, "decay_warning", `${d.daysInStatus} days in "${d.status}"`),
          detail: `${d.daysInStatus} days in "${d.status}" — auto-archive ${d.deadlineDate}`,
          due_date: d.deadlineDate,
          decay_deadline: d.deadlineDate,
        });
      }
    }

    // INSIGHTS: surface undismissed insight notifications
    const { data: activeInsights } = await supabase
      .from("insight_notifications")
      .select("id, title, message, category, priority")
      .eq("clerk_user_id", userId)
      .eq("is_dismissed", false)
      .order("created_at", { ascending: false })
      .limit(5);

    for (const insight of activeInsights ?? []) {
      actions.push({
        id: `insight-${insight.id}`,
        type: "insight",
        priority: insight.priority === "high" ? "today" : "week",
        company: "",
        role: "",
        action_label: "View",
        action_url: `/dashboard/insights?highlight=${insight.id}`,
        detail: insight.message,
        due_date: null,
      });
    }

    // Per-application dedup: one card per app, most specific wins. Prevents the
    // same application showing up as find_referral AND decay_warning AND stalled.
    const dedupedActions = dedupeByApp(actions);

    // Sort within each priority bucket by due_date (soonest first)
    const priorityOrder = { urgent: 0, today: 1, week: 2 };
    dedupedActions.sort((a, b) => {
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return 0;
    });

    // Also fetch compact stats for the bottom bar
    const [totalRes, activeRes, interviewCountRes, offeredRes] =
      await Promise.all([
        supabase
          .from("applications")
          .select("*", { count: "exact", head: true })
          .eq("clerk_user_id", userId)
          .is("deleted_at", null),
        supabase
          .from("applications")
          .select("*", { count: "exact", head: true })
          .eq("clerk_user_id", userId)
          .is("deleted_at", null)
          .in("status", ["applied", "interviewing"]),
        supabase
          .from("applications")
          .select("*", { count: "exact", head: true })
          .eq("clerk_user_id", userId)
          .is("deleted_at", null)
          .eq("status", "interviewing"),
        supabase
          .from("applications")
          .select("*", { count: "exact", head: true })
          .eq("clerk_user_id", userId)
          .is("deleted_at", null)
          .in("status", ["offered", "accepted"]),
      ]);

    return NextResponse.json({
      actions: dedupedActions,
      stats: {
        total: totalRes.count ?? 0,
        active: activeRes.count ?? 0,
        interviewing: interviewCountRes.count ?? 0,
        offers: offeredRes.count ?? 0,
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
