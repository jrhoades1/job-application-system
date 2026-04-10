"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

type ActionType =
  | "overdue_followup"
  | "followup_due_today"
  | "needs_first_followup"
  | "followup_this_week"
  | "interview_soon"
  | "debrief_needed"
  | "stalled"
  | "ready_to_apply"
  | "decay_warning"
  | "decay_imminent";

interface FollowUpActionPanelProps {
  actionType: ActionType;
  detail: string;
  applicationId: string;
  company: string;
  followUpDate: string | null;
  contact: string;
  onFollowUpDateChanged: (date: string | null) => void;
}

const ACTION_CONFIG: Record<
  ActionType,
  {
    icon: string;
    title: string;
    bgClass: string;
    borderClass: string;
    textClass: string;
    suggestion: string;
  }
> = {
  overdue_followup: {
    icon: "\u23F0",
    title: "Overdue Follow-up",
    bgClass: "bg-red-50 dark:bg-red-950",
    borderClass: "border-red-200 dark:border-red-800",
    textClass: "text-red-800 dark:text-red-200",
    suggestion: "Send a follow-up email or check the application portal for updates.",
  },
  followup_due_today: {
    icon: "\uD83D\uDCDE",
    title: "Follow-up Due Today",
    bgClass: "bg-blue-50 dark:bg-blue-950",
    borderClass: "border-blue-200 dark:border-blue-800",
    textClass: "text-blue-800 dark:text-blue-200",
    suggestion: "Reach out today to check on your application status.",
  },
  needs_first_followup: {
    icon: "\uD83D\uDC4B",
    title: "Needs First Follow-up",
    bgClass: "bg-amber-50 dark:bg-amber-950",
    borderClass: "border-amber-200 dark:border-amber-800",
    textClass: "text-amber-800 dark:text-amber-200",
    suggestion: "Set a follow-up date and draft an initial check-in email.",
  },
  followup_this_week: {
    icon: "\uD83D\uDCC5",
    title: "Follow-up This Week",
    bgClass: "bg-blue-50 dark:bg-blue-950",
    borderClass: "border-blue-200 dark:border-blue-800",
    textClass: "text-blue-800 dark:text-blue-200",
    suggestion: "Prepare your follow-up message ahead of the scheduled date.",
  },
  interview_soon: {
    icon: "\uD83C\uDFA4",
    title: "Interview Coming Up",
    bgClass: "bg-purple-50 dark:bg-purple-950",
    borderClass: "border-purple-200 dark:border-purple-800",
    textClass: "text-purple-800 dark:text-purple-200",
    suggestion: "Review the job description, prepare answers, and research the company.",
  },
  debrief_needed: {
    icon: "\uD83D\uDCDD",
    title: "Debrief Needed",
    bgClass: "bg-orange-50 dark:bg-orange-950",
    borderClass: "border-orange-200 dark:border-orange-800",
    textClass: "text-orange-800 dark:text-orange-200",
    suggestion: "Update the interview status and add notes about how it went.",
  },
  stalled: {
    icon: "\u23F3",
    title: "Application Stalled",
    bgClass: "bg-gray-50 dark:bg-gray-950",
    borderClass: "border-gray-200 dark:border-gray-800",
    textClass: "text-gray-800 dark:text-gray-200",
    suggestion: "Follow up or consider withdrawing if there's been no response.",
  },
  ready_to_apply: {
    icon: "\uD83D\uDCC4",
    title: "Ready to Apply",
    bgClass: "bg-green-50 dark:bg-green-950",
    borderClass: "border-green-200 dark:border-green-800",
    textClass: "text-green-800 dark:text-green-200",
    suggestion: "Review your materials and submit your application.",
  },
  decay_warning: {
    icon: "\u26A0\uFE0F",
    title: "Approaching Auto-Archive",
    bgClass: "bg-amber-50 dark:bg-amber-950",
    borderClass: "border-amber-200 dark:border-amber-800",
    textClass: "text-amber-800 dark:text-amber-200",
    suggestion: "Take action or this application will be auto-archived.",
  },
  decay_imminent: {
    icon: "\uD83D\uDEA8",
    title: "Auto-Archive Imminent",
    bgClass: "bg-red-50 dark:bg-red-950",
    borderClass: "border-red-200 dark:border-red-800",
    textClass: "text-red-800 dark:text-red-200",
    suggestion: "Act now or this application will be archived in the next nightly run.",
  },
};

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export function FollowUpActionPanel({
  actionType,
  detail,
  applicationId,
  company,
  followUpDate,
  contact,
  onFollowUpDateChanged,
}: FollowUpActionPanelProps) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [snoozing, setSnoozing] = useState(false);

  if (dismissed) return null;

  const config = ACTION_CONFIG[actionType];
  if (!config) return null;

  const isFollowUpType = [
    "overdue_followup",
    "followup_due_today",
    "needs_first_followup",
    "followup_this_week",
    "stalled",
    "decay_warning",
    "decay_imminent",
  ].includes(actionType);

  async function handleSnooze(days: number) {
    setSnoozing(true);
    const newDate = addDays(days);
    try {
      const res = await fetch(`/api/applications/${applicationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ follow_up_date: newDate }),
      });
      if (res.ok) {
        onFollowUpDateChanged(newDate);
        toast.success(`Follow-up snoozed to ${newDate}`);
        setDismissed(true);
      } else {
        toast.error("Failed to snooze");
      }
    } catch {
      toast.error("Something went wrong");
    }
    setSnoozing(false);
  }

  async function handleMarkDone() {
    setSnoozing(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ follow_up_date: null }),
      });
      if (res.ok) {
        onFollowUpDateChanged(null);
        toast.success("Follow-up cleared");
        setDismissed(true);
      } else {
        toast.error("Failed to clear follow-up");
      }
    } catch {
      toast.error("Something went wrong");
    }
    setSnoozing(false);
  }

  function handleBackToToday() {
    router.push("/dashboard");
  }

  return (
    <Card className={`${config.borderClass} ${config.bgClass}`}>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{config.icon}</span>
              <h3 className={`text-sm font-semibold ${config.textClass}`}>
                {config.title}
              </h3>
            </div>
            <p className={`text-sm ${config.textClass} opacity-80 mb-1`}>
              {detail}
            </p>
            <p className="text-xs text-muted-foreground">
              {config.suggestion}
            </p>
            {followUpDate && (
              <p className="text-xs text-muted-foreground mt-1">
                Follow-up date: <span className="font-medium">{followUpDate}</span>
                {contact && <> &middot; Contact: <span className="font-medium">{contact}</span></>}
              </p>
            )}
            {!followUpDate && contact && (
              <p className="text-xs text-muted-foreground mt-1">
                Contact: <span className="font-medium">{contact}</span>
              </p>
            )}
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="text-muted-foreground hover:text-foreground text-sm p-1 -mt-1 -mr-1"
            aria-label="Dismiss"
          >
            {"\u2715"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-inherit">
          {isFollowUpType && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleSnooze(3)}
                disabled={snoozing}
                className="text-xs"
              >
                Snooze 3 days
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleSnooze(7)}
                disabled={snoozing}
                className="text-xs"
              >
                Snooze 7 days
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleMarkDone}
                disabled={snoozing}
                className="text-xs"
              >
                Clear follow-up
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleBackToToday}
            className="text-xs ml-auto"
          >
            Back to Today
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
