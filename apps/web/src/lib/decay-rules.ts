/**
 * Decay rules for automatic application lifecycle management.
 *
 * Each status has thresholds (in days) that determine when to warn
 * the user and when to auto-transition stale records.
 *
 * "Days in status" is computed from application_status_history
 * (the most recent row where to_status = current status),
 * falling back to applications.created_at if no history exists.
 */

export interface DecayRule {
  /** Days before first warning appears in today-actions */
  warnDays: number;
  /** Days before auto-transition fires (nightly cron) */
  autoDays: number;
  /** Source label recorded in application_status_history */
  autoAction: "auto_withdraw" | "auto_skip";
  /** Target status for applications table (null = don't update apps) */
  targetAppStatus: "withdrawn" | null;
  /** Target status for pipeline_leads table (null = don't update leads) */
  targetLeadStatus: "auto_skipped" | null;
  /** Action label shown in decay warning UI */
  positiveLabel: string;
  /** Dismiss label shown in decay warning UI */
  dismissLabel: string;
}

export const DECAY_RULES: Record<string, DecayRule> = {
  pending_review: {
    warnDays: 7,
    autoDays: 14,
    autoAction: "auto_skip",
    targetAppStatus: "withdrawn",
    targetLeadStatus: "auto_skipped",
    positiveLabel: "Review",
    dismissLabel: "Skip",
  },
  evaluating: {
    warnDays: 7,
    autoDays: 14,
    autoAction: "auto_withdraw",
    targetAppStatus: "withdrawn",
    targetLeadStatus: null,
    positiveLabel: "Apply or pass",
    dismissLabel: "Archive",
  },
  applied: {
    warnDays: 7,
    autoDays: 30,
    autoAction: "auto_withdraw",
    targetAppStatus: "withdrawn",
    targetLeadStatus: null,
    positiveLabel: "Follow up",
    dismissLabel: "Archive",
  },
  // interviewing: intentionally excluded — active interviews are
  // highest-value pipeline stage, never auto-archive
} as const;

/** Statuses that the decay engine processes */
export const DECAYABLE_STATUSES = Object.keys(DECAY_RULES);

/** Days before autoDays when a warning escalates to "imminent" */
export const IMMINENT_THRESHOLD_DAYS = 3;
