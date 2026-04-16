// Referral outreach helpers: target LinkedIn searches, pitch derivation, template rendering.
// Three outreach archetypes, each matched to a target audience and a message template.

import type { MatchScoreRow } from "@/types";

export type TemplateType = "referral" | "recruiter_ping" | "warm_intro";

export type TargetType = "hiring_team" | "recruiter" | "mutuals";

export interface TemplateData {
  firstName: string; // defaults to "there" if empty
  role: string;
  company: string;
  reqId?: string | null;
  pitch: string; // the "OneLinePitch"
  dateApplied?: string | null; // ISO date
  sharedContext?: string | null; // only used by warm_intro
}

// ---------------------------------------------------------------------------
// LinkedIn search URLs
// ---------------------------------------------------------------------------

const LINKEDIN_PEOPLE_SEARCH = "https://www.linkedin.com/search/results/people/";

// LinkedIn's advanced filters (currentCompany, schoolFilter) require URN IDs
// that we cannot resolve from a plain company name. The keyword-based fallback
// quotes the company and combines it with role-tier vocabulary, which gets us
// ~90% of the precision without an enrichment step.
function buildKeywordSearch(keywords: string, extraParams: Record<string, string> = {}): string {
  const params = new URLSearchParams({
    keywords,
    origin: "GLOBAL_SEARCH_HEADER",
    ...extraParams,
  });
  return `${LINKEDIN_PEOPLE_SEARCH}?${params.toString()}`;
}

// Tier the role so the hiring-team search finds the right management level
// (a Staff IC reports to a Director, a Manager reports to a Senior Director/VP, etc.)
function roleTier(role: string): "ic" | "manager" | "director" | "exec" {
  const r = role.toLowerCase();
  if (/\b(cto|cio|ceo|cpo|chief|svp)\b/.test(r)) return "exec";
  if (/\b(vp|vice president|head of|senior director)\b/.test(r)) return "exec";
  if (/\b(director|senior manager)\b/.test(r)) return "director";
  if (/\b(manager|lead)\b/.test(r)) return "manager";
  return "ic";
}

function hiringTeamKeywords(role: string): string {
  switch (roleTier(role)) {
    case "exec":
      return '("chief" OR "svp" OR "senior vice president" OR "board")';
    case "director":
      return '("vp" OR "vice president" OR "director" OR "head of")';
    case "manager":
      return '("director" OR "senior manager" OR "head of")';
    case "ic":
    default:
      return '("engineering manager" OR "manager" OR "director" OR "head of")';
  }
}

export function buildLinkedInUrls(company: string, role: string): Record<TargetType, string> {
  const companyTerm = `"${company}"`;
  return {
    hiring_team: buildKeywordSearch(`${companyTerm} AND ${hiringTeamKeywords(role)}`),
    recruiter: buildKeywordSearch(
      `${companyTerm} AND ("recruiter" OR "talent acquisition" OR "sourcer" OR "technical recruiter")`
    ),
    // network=["F","S"] filters to 1st- and 2nd-degree connections.
    mutuals: buildKeywordSearch(companyTerm, { network: '["F","S"]' }),
  };
}

// ---------------------------------------------------------------------------
// OneLinePitch derivation
// ---------------------------------------------------------------------------

// Pull the user's strongest requirement hit and turn it into a pitch line.
// Returns null if we have nothing to say, so the UI can prompt for a manual pitch.
export function derivePitch(role: string, score: MatchScoreRow | null | undefined): string | null {
  if (!score) return null;
  const matched = score.requirements_matched ?? [];
  if (matched.length === 0) return null;

  // Prefer entries with explicit evidence -- those are the ones with a real
  // achievement behind them rather than a keyword coincidence.
  const withEvidence = matched.find((m) => m.evidence && m.evidence.length > 0);
  const top = withEvidence ?? matched[0];

  if (top.evidence && top.evidence.length > 0) {
    return trimPitch(top.evidence);
  }
  // Fall back to rephrasing the requirement itself.
  return trimPitch(`My background maps directly to ${top.requirement.toLowerCase()}.`);
}

function trimPitch(text: string): string {
  // Keep pitches short; one sentence, no trailing period duplication.
  const firstSentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
  const cleaned = firstSentence.trim().replace(/\s+/g, " ");
  if (cleaned.length <= 200) return cleaned;
  return cleaned.slice(0, 197).trimEnd() + "...";
}

// ---------------------------------------------------------------------------
// Template rendering
// ---------------------------------------------------------------------------

function formatDateApplied(iso: string | null | undefined): string {
  if (!iso) return "recently";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "recently";
  // e.g. "April 16"
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

function firstNameOrFallback(firstName: string): string {
  const trimmed = firstName.trim();
  return trimmed.length > 0 ? trimmed : "there";
}

function reqIdSuffix(reqId?: string | null): string {
  if (!reqId || reqId.trim().length === 0) return "";
  return ` (req ${reqId.trim()})`;
}

// Template 1: Referral ask
function renderReferral(d: TemplateData): string {
  const name = firstNameOrFallback(d.firstName);
  return [
    `Hi ${name}, I just applied for the ${d.role} at ${d.company}${reqIdSuffix(d.reqId)}. Short version of why it fits: ${d.pitch}`,
    ``,
    `Would you be open to putting in a referral? I can send a paste-ready blurb and my resume so it's a 30-second lift on your end. Completely understand if it's not a fit or you don't know the hiring team.`,
    ``,
    `Thanks either way,`,
    `Jimmy`,
  ].join("\n");
}

// Template 2: Recruiter ping
function renderRecruiterPing(d: TemplateData): string {
  const name = firstNameOrFallback(d.firstName);
  return [
    `Hi ${name}, I applied for the ${d.role} at ${d.company} on ${formatDateApplied(d.dateApplied)} and wanted to make sure it's on your radar. Quick context: ${d.pitch}`,
    ``,
    `Happy to jump on a 10-minute intro if it helps you gauge fit. Otherwise I'll watch for next steps.`,
    ``,
    `Thanks,`,
    `Jimmy`,
  ].join("\n");
}

// Template 3: Warm intro -- requires a real shared-context hook.
function renderWarmIntro(d: TemplateData): string {
  const name = firstNameOrFallback(d.firstName);
  const hook = (d.sharedContext ?? "").trim();
  const hookLine = hook.length > 0 ? `noticed ${hook}. ` : "";
  return [
    `Hi ${name}, ${hookLine}I just applied for the ${d.role} at ${d.company} and before I invest more in the process, I'd value your honest read on the team and how decisions actually get made there.`,
    ``,
    `15 minutes this week or next?`,
    ``,
    `Thanks,`,
    `Jimmy`,
  ].join("\n");
}

export function renderTemplate(type: TemplateType, data: TemplateData): string {
  switch (type) {
    case "referral":
      return renderReferral(data);
    case "recruiter_ping":
      return renderRecruiterPing(data);
    case "warm_intro":
      return renderWarmIntro(data);
  }
}

export const TEMPLATE_LABELS: Record<TemplateType, string> = {
  referral: "Referral ask",
  recruiter_ping: "Recruiter ping",
  warm_intro: "Warm intro",
};

export const TARGET_LABELS: Record<TargetType, string> = {
  hiring_team: "Hiring team",
  recruiter: "Recruiters",
  mutuals: "Mutuals",
};

export const TEMPLATE_TO_TARGET: Record<TemplateType, TargetType> = {
  referral: "hiring_team",
  recruiter_ping: "recruiter",
  warm_intro: "mutuals",
};
