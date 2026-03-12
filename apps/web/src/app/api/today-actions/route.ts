import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";

export interface TodayAction {
  id: string;
  type:
    | "interview_soon"
    | "overdue_followup"
    | "debrief_needed"
    | "new_leads"
    | "followup_due_today"
    | "needs_first_followup"
    | "ready_to_apply"
    | "stalled"
    | "followup_this_week";
  priority: "urgent" | "today" | "week";
  company: string;
  role: string;
  action_label: string;
  action_url: string;
  detail: string;
  due_date: string | null;
}

interface InterviewRound {
  round: number;
  date: string;
  status: string;
  type?: string;
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
    ] = await Promise.all([
      // Interviewing apps (check JSONB for upcoming interviews)
      supabase
        .from("applications")
        .select("id, company, role, interviews")
        .eq("clerk_user_id", userId)
        .is("deleted_at", null)
        .eq("status", "interviewing")
        .not("interviews", "eq", "[]"),

      // Overdue follow-ups
      supabase
        .from("applications")
        .select("id, company, role, follow_up_date, status")
        .eq("clerk_user_id", userId)
        .is("deleted_at", null)
        .not("follow_up_date", "is", null)
        .lt("follow_up_date", todayStr),

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

      // Follow-ups due today
      supabase
        .from("applications")
        .select("id, company, role, follow_up_date")
        .eq("clerk_user_id", userId)
        .is("deleted_at", null)
        .eq("follow_up_date", todayStr),

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

      // Follow-ups coming this week (tomorrow through +7 days)
      supabase
        .from("applications")
        .select("id, company, role, follow_up_date")
        .eq("clerk_user_id", userId)
        .is("deleted_at", null)
        .not("follow_up_date", "is", null)
        .gt("follow_up_date", todayStr)
        .lte("follow_up_date", in7d),
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
            action_url: `/dashboard/tracker/${app.id}`,
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
        action_url: `/dashboard/tracker/${app.id}`,
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
            action_url: `/dashboard/tracker/${app.id}`,
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
        action_url: `/dashboard/tracker/${app.id}`,
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
        action_url: `/dashboard/tracker/${app.id}`,
        detail: `Applied ${app.applied_date} — no follow-up scheduled`,
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
        action_url: `/dashboard/tracker/${app.id}`,
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
        action_url: `/dashboard/tracker/${app.id}`,
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
        action_url: `/dashboard/tracker/${app.id}`,
        detail: `Follow-up on ${app.follow_up_date}`,
        due_date: app.follow_up_date,
      });
    }

    // Sort within each priority bucket by due_date (soonest first)
    const priorityOrder = { urgent: 0, today: 1, week: 2 };
    actions.sort((a, b) => {
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
      actions,
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
