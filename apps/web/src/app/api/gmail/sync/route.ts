import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";
import { extractJobsFromEmail, type ExtractedJob } from "@/lib/extract-jobs";
import { scrapeJobDescription } from "@/lib/scrape-job-url";
import {
  getGmailTokens,
  listGmailMessages,
  getGmailMessage,
  getHeader,
  extractEmailText,
  computeEmailFingerprint,
  getOrCreateLabel,
  labelMessage,
} from "@/lib/gmail";
import {
  extractRequirements,
  scoreRequirement,
  calculateOverallScore,
} from "@/scoring";
import {
  extractRequirementsWithAI,
  requirementsFromRoleTitle,
} from "@/lib/extract-requirements-ai";

// Non-job email signals (ported from email_parse.py)
const NON_JOB_PATTERNS = [
  /unsubscribe/i,
  /weekly digest/i,
  /newsletter/i,
  /birthday/i,
  /connection request/i,
  /endorsed you/i,
  /congratulations on your work anniversary/i,
  /people you may know/i,
  /\bads?\b/i,
  /promoted post/i,
  /invoice/i,
  /receipt/i,
  /payment/i,
];

// Job-related signals in subject lines
const JOB_SUBJECT_PATTERNS = [
  /job(?:s)?\s/i,
  /position/i,
  /opportunit/i,
  /rol[e|es]\b/i,
  /opening/i,
  /hiring/i,
  /recruiter/i,
  /interview/i,
  /application/i,
  /career/i,
  /engineer/i,
  /director/i,
  /manager/i,
  /vp\b/i,
  /chief\b/i,
  /developer/i,
];

// Platforms that send multi-job digest emails
const MULTI_JOB_PLATFORMS: Record<string, RegExp> = {
  LinkedIn: /linkedin\.com/i,
  Indeed: /indeed\.com/i,
  Glassdoor: /glassdoor\.com/i,
  ZipRecruiter: /ziprecruiter\.com/i,
  Handshake: /joinhandshake\.com/i,
};

// Rejection / status update patterns in subject — these are NOT new job leads
const REJECTION_SUBJECT_PATTERNS = [
  /thank you for (participating|applying|your (interest|application))/i,
  /we('ve| have) (decided|chosen) (to|not to)/i,
  /unfortunately/i,
  /not (moving|proceeding) forward/i,
  /position has been filled/i,
  /application (update|status)/i,
  /after careful (review|consideration)/i,
];

// Rejection patterns that appear in the email body — more specific to avoid false positives
const REJECTION_BODY_PATTERNS = [
  /we('ve| have) (decided|chosen) to (move|go) forward with other/i,
  /will not be (moving|proceeding) forward/i,
  /not (moving|proceeding) forward with your/i,
  /position has been filled/i,
  /we regret to inform you/i,
  /after careful (review|consideration).{0,60}(decided|chosen|pursuing other)/i,
  /application (has been |was )?unsuccessful/i,
  /role is no longer available/i,
  /unfortunately.{0,40}(not able to|will not|won't|cannot).{0,40}(offer|move forward|proceed)/i,
];

// Application confirmation patterns — these confirm an application was RECEIVED (not rejected)
const CONFIRMATION_SUBJECT_PATTERNS = [
  /application (received|confirmed|submitted)/i,
  /we('ve| have) received your application/i,
  /thank you for applying/i,
  /thanks for (your )?application/i,
  /your application (to|for|has been)/i,
  /application (acknowledgement|confirmation)/i,
];

const CONFIRMATION_BODY_PATTERNS = [
  /we('ve| have) received your application/i,
  /your application (for|to) .{1,80}(has been |was )?(received|submitted|recorded)/i,
  /thank you for (your interest|applying|submitting)/i,
  /thanks for applying/i,
  /application.{0,30}(successfully|has been) (submitted|received)/i,
  /we('ll| will) (review|carefully review) your (application|qualifications|resume)/i,
  /your (resume|application) (is|has been) (now )?in our system/i,
];

// Company aliases for fuzzy matching (mirrors pipeline_config.json)
const COMPANY_ALIASES: Record<string, string[]> = {
  meta: ["facebook", "meta platforms", "meta platforms inc"],
  alphabet: ["google", "google llc", "google inc"],
  amazon: ["amazon.com", "amazon.com inc", "amazon web services", "aws"],
  microsoft: ["msft", "microsoft corporation", "microsoft corp"],
  cognizant: ["cognizant technology solutions", "cognizant softvision"],
  "unitedhealth group": ["uhg", "optum", "unitedhealthcare"],
  "cvs health": ["cvs", "aetna", "cvs caremark"],
  "elevance health": ["anthem", "anthem inc"],
};

function isConfirmationEmail(subject: string, body: string): boolean {
  const subjectClean = subject.replace(/^(fw|fwd|re)\s*:\s*/gi, "").trim();

  for (const pattern of CONFIRMATION_SUBJECT_PATTERNS) {
    if (pattern.test(subjectClean)) return true;
  }

  const bodySnippet = body.slice(0, 3000);
  for (const pattern of CONFIRMATION_BODY_PATTERNS) {
    if (pattern.test(bodySnippet)) return true;
  }

  return false;
}

/** Extract company name from a confirmation email sender/subject/body */
function extractConfirmationCompany(from: string, subject: string, body: string): string | null {
  // Try "from" field first — most confirmation emails come from the company
  // Format: "Company Name <noreply@company.com>" or "noreply@company.com"
  const senderName = from.replace(/<.*>/, "").replace(/"/g, "").trim();
  if (senderName && !/^(no-?reply|notifications?|careers?|jobs?|talent|recruiting|hr)$/i.test(senderName)) {
    return senderName;
  }

  // Try domain from email address
  const domainMatch = from.match(/@([a-zA-Z0-9.-]+)/);
  if (domainMatch) {
    const domain = domainMatch[1].replace(/\.(com|org|io|co|net)$/i, "").split(".").pop();
    if (domain && domain.length > 2 && !/^(gmail|outlook|yahoo|hotmail|noreply|mail)$/i.test(domain)) {
      return domain.charAt(0).toUpperCase() + domain.slice(1);
    }
  }

  // Try subject: "Your application to [Company]" or "at [Company]"
  const atMatch = subject.match(/(?:at|to|for|with)\s+([A-Z][A-Za-z0-9 &.,'-]+)/);
  if (atMatch) return atMatch[1].trim();

  return null;
}

/** Normalize company name for matching */
function normalizeCompany(name: string): string {
  let lower = name.toLowerCase().trim();
  // Strip common suffixes
  lower = lower.replace(/\s*(inc\.?|llc|ltd\.?|corp\.?|corporation|co\.?|group|plc)\s*$/i, "").trim();
  // Check aliases
  for (const [canonical, aliases] of Object.entries(COMPANY_ALIASES)) {
    if (lower === canonical || aliases.some((a) => a === lower)) {
      return canonical;
    }
  }
  return lower;
}

function isRejectionEmail(subject: string, body: string): boolean {
  const subjectClean = subject.replace(/^(fw|fwd|re)\s*:\s*/gi, "").trim();

  // Check subject-level patterns
  for (const pattern of REJECTION_SUBJECT_PATTERNS) {
    if (pattern.test(subjectClean)) return true;
  }

  // Check body-level patterns (first 3000 chars to avoid scanning footers)
  const bodySnippet = body.slice(0, 3000);
  for (const pattern of REJECTION_BODY_PATTERNS) {
    if (pattern.test(bodySnippet)) return true;
  }

  return false;
}

function isJobEmail(from: string, subject: string, body: string): boolean {
  // Check for rejection/status emails first — even if forwarded, these aren't new leads
  if (isRejectionEmail(subject, body)) return false;

  // Accept forwarded emails — user explicitly forwarded it, so they want it tracked
  if (/^(fw|fwd)\s*:/i.test(subject.trim())) return true;

  // Accept known job platforms — check from AND subject for forwarded emails
  // (forwarded emails show from=user, but subject/body mention the platform)
  const fromAndSubject = `${from} ${subject}`;
  for (const regex of Object.values(MULTI_JOB_PLATFORMS)) {
    if (regex.test(fromAndSubject)) return true;
  }

  // Accept if subject matches job patterns
  for (const pattern of JOB_SUBJECT_PATTERNS) {
    if (pattern.test(subject)) return true;
  }

  // Only reject via non-job patterns when no positive signal matched above.
  // Check subject + from only — body contains "unsubscribe" in nearly every email.
  for (const pattern of NON_JOB_PATTERNS) {
    if (pattern.test(fromAndSubject)) return false;
  }

  return false;
}

function detectPlatform(from: string, subject = "", body = ""): string | null {
  const text = `${from} ${subject} ${body.slice(0, 2000)}`;
  for (const [name, regex] of Object.entries(MULTI_JOB_PLATFORMS)) {
    if (regex.test(text)) return name;
  }
  if (/swooped/i.test(from)) return "Swooped";
  if (/lever\.co/i.test(from)) return "Lever";
  if (/greenhouse/i.test(from)) return "Greenhouse";
  if (/workday/i.test(from)) return "Workday";
  if (/ladders/i.test(text)) return "Ladders";
  if (/built\s*in/i.test(text)) return "Built In";
  return null;
}

// Simple extractor: try to pull company + role from subject
// Handles patterns like:
// "New Job: Software Engineer at Acme Corp"
// "Acme Corp - Director of Engineering"
// "Your application to VP Engineering at TechCo"
function extractCompanyRole(
  rawSubject: string
): { company: string; role: string } | null {
  // Strip Fw:/Fwd:/Re: prefixes
  const subject = rawSubject.replace(/^(fw|fwd|re)\s*:\s*/i, "").trim();

  // "Role at Company"
  const atMatch = subject.match(/^(.+?)\s+at\s+(.+?)(?:\s*[-|]|$)/i);
  if (atMatch) {
    return { role: atMatch[1].trim(), company: atMatch[2].trim() };
  }

  // "Company - Role" or "Company: Role"
  const dashMatch = subject.match(/^(.+?)\s*[-:]\s*(.+)$/);
  if (dashMatch) {
    const left = dashMatch[1].trim();
    const right = dashMatch[2].trim();
    // Heuristic: if left looks like a company name (shorter, title case), use left=company
    if (left.length < right.length) {
      return { company: left, role: right };
    }
    return { company: right, role: left };
  }

  return null;
}

function isMultiJobPlatform(from: string, subject = "", body = ""): boolean {
  const text = `${from} ${subject} ${body.slice(0, 2000)}`;
  // Check for known digest platforms
  if (Object.values(MULTI_JOB_PLATFORMS).some((regex) => regex.test(text))) return true;
  // Also catch Ladders, Built In digests
  if (/ladders/i.test(text)) return true;
  if (/built\s*in/i.test(text)) return true;
  // "job alert" in subject is always a digest
  if (/job alert/i.test(subject)) return true;
  return false;
}

export const maxDuration = 300;

export async function POST() {
  try {
    const { supabase, userId } = await getAuthenticatedClient();

    const tokens = await getGmailTokens(supabase, userId);
    if (!tokens) {
      return NextResponse.json(
        { error: "Gmail session expired. Please reconnect your account." },
        { status: 401 }
      );
    }

    // Fetch messages from last 30 days
    const messages = await listGmailMessages(
      tokens.access_token,
      "newer_than:30d",
      150
    );

    if (messages.length === 0) {
      return NextResponse.json({ found: 0, inserted: 0, skipped: 0 });
    }

    // Load existing leads — select status + company so we can clear re-processable records
    // Only consider non-deleted leads for dedup
    const { data: existingLeads } = await supabase
      .from("pipeline_leads")
      .select("email_uid, status, company")
      .eq("clerk_user_id", userId)
      .is("deleted_at", null);

    const existingUids = new Set((existingLeads ?? []).map((l) => l.email_uid));

    // Identify leads that should be re-processed:
    // 1. auto_skipped — re-evaluate with updated filter
    // 2. Badly parsed — company is "Fw", "Fwd", "Re", "Unknown", or empty
    const BAD_COMPANY = /^(fw|fwd|re|unknown|)$/i;
    const reprocessUids = (existingLeads ?? [])
      .filter((l) => l.status === "auto_skipped" || BAD_COMPANY.test((l.company ?? "").trim()))
      .map((l) => l.email_uid);

    if (reprocessUids.length > 0) {
      const now = new Date().toISOString();

      // Soft delete bad pipeline_leads
      await supabase
        .from("pipeline_leads")
        .update({ deleted_at: now })
        .eq("clerk_user_id", userId)
        .is("deleted_at", null)
        .in("email_uid", reprocessUids);

      // Soft delete any auto-promoted applications from bad parses
      await supabase
        .from("applications")
        .update({ deleted_at: now })
        .eq("clerk_user_id", userId)
        .is("deleted_at", null)
        .in("email_uid", reprocessUids);

      for (const uid of reprocessUids) {
        existingUids.delete(uid);
      }
    }

    // Load user achievements for scoring
    const { data: profile } = await supabase
      .from("profiles")
      .select("achievements")
      .eq("clerk_user_id", userId)
      .single();

    const achievementsMap: Record<string, string[]> = {};
    const achievements = profile?.achievements ?? [];
    if (Array.isArray(achievements)) {
      for (const cat of achievements) {
        if (cat.category && Array.isArray(cat.items)) {
          achievementsMap[cat.category] = cat.items.map(
            (i: { text: string }) => i.text
          );
        }
      }
    }

    async function scoreLead(
      descriptionText: string,
      role: string = "",
      company: string = "",
      { digestEmail = false }: { digestEmail?: boolean } = {}
    ) {
      // For digest emails (LinkedIn "jobs for you", etc.), the description_text
      // is the whole email digest, not a real JD. Scoring it produces misleading
      // red flags like "content is truncated". Use role-title inference instead.
      if (digestEmail) {
        const allReqs = requirementsFromRoleTitle(role);
        const matches = allReqs.map((r) => scoreRequirement(r, achievementsMap));
        const score = calculateOverallScore(matches);
        return { score, red_flags: [] as string[] };
      }

      const reqs = extractRequirements(descriptionText);
      let allReqs = [...reqs.hard_requirements, ...reqs.preferred];
      let redFlags = reqs.red_flags;

      // AI fallback: if regex extraction found nothing, use Haiku to parse
      if (allReqs.length === 0 && descriptionText.length > 50) {
        try {
          const aiReqs = await extractRequirementsWithAI(
            descriptionText,
            role,
            company
          );
          allReqs = [...aiReqs.hard_requirements, ...aiReqs.preferred];
          redFlags = [...redFlags, ...aiReqs.red_flags];
        } catch (err) {
          console.error("AI requirement extraction failed:", err);
        }
      }

      // Last resort: infer requirements from role title
      if (allReqs.length === 0 && role) {
        allReqs = requirementsFromRoleTitle(role);
      }

      const matches = allReqs.map((r) => scoreRequirement(r, achievementsMap));
      const score = calculateOverallScore(matches);
      return { score, red_flags: redFlags };
    }

    // Load open applications for confirmation matching
    const { data: openApps } = await supabase
      .from("applications")
      .select("id, company, role, status")
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .in("status", ["evaluating", "pending_review", "ready_to_apply"]);

    let inserted = 0;
    let skipped = 0;
    let confirmed = 0;

    // Resolve Gmail labels for tagging processed messages
    const processedLabelId = await getOrCreateLabel(tokens.access_token, "pipeline/processed");
    const notJobLabelId = await getOrCreateLabel(tokens.access_token, "pipeline/not-job");

    for (const msg of messages) {
      // Skip if base email ID or any multi-job variant already exists
      // (reparse renames originals to {uid}_0, so check that too)
      if (
        existingUids.has(msg.id) ||
        existingUids.has(`${msg.id}_0`) ||
        existingUids.has(`${msg.id}_1`)
      ) {
        // Still label already-processed messages in Gmail (backfill)
        if (processedLabelId) labelMessage(tokens.access_token, msg.id, processedLabelId).catch(() => {});
        skipped++;
        continue;
      }

      const full = await getGmailMessage(tokens.access_token, msg.id);
      if (!full) continue;

      const from = getHeader(full, "from");
      const subject = getHeader(full, "subject");
      const date = getHeader(full, "date");
      const body = extractEmailText(full);

      const emailDate = date ? new Date(date).toISOString() : new Date().toISOString();

      // Check for application confirmation emails BEFORE job/rejection filtering
      if (isConfirmationEmail(subject, body)) {
        const confirmCompany = extractConfirmationCompany(from, subject, body);
        if (confirmCompany && openApps && openApps.length > 0) {
          const normalized = normalizeCompany(confirmCompany);
          // Find matching application by company name
          const match = openApps.find((a) => {
            const appNorm = normalizeCompany(a.company);
            return appNorm === normalized || appNorm.includes(normalized) || normalized.includes(appNorm);
          });

          if (match) {
            const today = new Date().toISOString().split("T")[0];
            const followUp = new Date();
            followUp.setDate(followUp.getDate() + 7);

            await supabase
              .from("applications")
              .update({
                status: "applied",
                applied_date: today,
                follow_up_date: followUp.toISOString().split("T")[0],
              })
              .eq("id", match.id)
              .eq("clerk_user_id", userId);

            await supabase.from("application_status_history").insert({
              application_id: match.id,
              clerk_user_id: userId,
              from_status: match.status,
              to_status: "applied",
              source: "email_detection",
            });

            // Remove from open apps so we don't double-match
            const idx = openApps.findIndex((a) => a.id === match.id);
            if (idx !== -1) openApps.splice(idx, 1);

            confirmed++;
            existingUids.add(msg.id);
            if (processedLabelId) labelMessage(tokens.access_token, msg.id, processedLabelId).catch(() => {});
            continue;
          }
        }
        // If no match found, fall through to normal processing
        existingUids.add(msg.id);
        skipped++;
        if (processedLabelId) labelMessage(tokens.access_token, msg.id, processedLabelId).catch(() => {});
        continue;
      }

      if (!isJobEmail(from, subject, body)) {
        // Store as auto_skipped so user can see what was caught — not silently dropped
        await supabase.from("pipeline_leads").insert({
          clerk_user_id: userId,
          company: from,
          role: subject,
          email_uid: msg.id,
          email_date: emailDate,
          raw_subject: subject,
          status: "auto_skipped",
          skip_reason: "Non-job email (filtered by pattern matching)",
          red_flags: [],
          created_at: new Date().toISOString(),
        });
        existingUids.add(msg.id);
        skipped++;
        if (notJobLabelId) labelMessage(tokens.access_token, msg.id, notJobLabelId).catch(() => {});
        continue;
      }

      const fingerprint = await computeEmailFingerprint(from, subject, body);

      // Check fingerprint dedup (different message IDs can have same content)
      // Also check by raw_subject match as a fallback
      const { data: fpExists } = await supabase
        .from("pipeline_leads")
        .select("id")
        .eq("clerk_user_id", userId)
        .eq("raw_subject", subject)
        .eq("email_date", emailDate)
        .is("deleted_at", null)
        .maybeSingle();

      if (fpExists) {
        existingUids.add(msg.id);
        skipped++;
        continue;
      }

      const platform = detectPlatform(from, subject, body);

      // Multi-job digest emails: extract all jobs via AI
      if (isMultiJobPlatform(from, subject, body)) {
        let jobs: ExtractedJob[] = [];
        try {
          jobs = await extractJobsFromEmail(body, subject, platform);
        } catch (err) {
          console.error("AI job extraction failed, falling back to subject:", err);
        }

        if (jobs.length === 0) {
          // Fallback: try subject extraction as single job
          const extracted = extractCompanyRole(subject);
          jobs = extracted ? [extracted] : [];
        }

        const URL_LIKE_COMPANY = /^(https?|http|ftp|www)$/i;
        for (let i = 0; i < jobs.length; i++) {
          const job = jobs[i];
          const leadUid = `${msg.id}_${i}`;

          if (existingUids.has(leadUid)) continue;
          if (URL_LIKE_COMPANY.test(job.company.trim())) continue;

          // Store whatever details the AI extracted from the email
          let leadText = job.description || "";
          const careerPageUrl = job.url ?? null;
          const compensation = job.salary ?? null;

          if (!leadText) {
            leadText = `${job.role} at ${job.company}${job.location ? ` — ${job.location}` : ""}${compensation ? ` | ${compensation}` : ""}`;
          }

          // Always treat multi-job platform leads as digest — email never has full JD
          const leadScore = await scoreLead(leadText, job.role, job.company, { digestEmail: true });

          await supabase.from("pipeline_leads").insert({
            clerk_user_id: userId,
            company: job.company,
            role: job.role,
            location: job.location ?? null,
            source_platform: platform,
            email_uid: leadUid,
            email_date: emailDate,
            raw_subject: subject,
            description_text: leadText,
            career_page_url: careerPageUrl,
            compensation,
            status: "pending_review",
            score_overall: leadScore.score.overall,
            score_match_percentage: leadScore.score.match_percentage,
            score_details: {
              strong_count: leadScore.score.strong_count,
              partial_count: leadScore.score.partial_count,
              gap_count: leadScore.score.gap_count,
            },
            red_flags: leadScore.red_flags,
            created_at: new Date().toISOString(),
          });

          existingUids.add(leadUid);
          inserted++;
        }

        // Also mark the base email ID as seen to avoid re-processing
        existingUids.add(msg.id);
        continue;
      }

      // Single-job email: try subject parsing first, then AI fallback
      let extracted = extractCompanyRole(subject);

      // If subject parsing failed or returned a bad company, use AI extraction
      if (!extracted || BAD_COMPANY.test(extracted.company.trim())) {
        try {
          const aiJobs = await extractJobsFromEmail(body, subject, platform);
          if (aiJobs.length > 0) {
            extracted = { company: aiJobs[0].company, role: aiJobs[0].role };
          }
        } catch (err) {
          console.error("AI extraction fallback failed for single email:", err);
        }
      }

      const singleText = body.slice(0, 5000);
      const singleScore = await scoreLead(
        singleText,
        extracted?.role ?? subject,
        extracted?.company ?? ""
      );

      // Use sender name as fallback so leads are identifiable even without AI extraction
      const senderName = from.replace(/<.*>/, "").replace(/"/g, "").trim();
      const finalCompany = extracted?.company || senderName || null;
      const finalRole = extracted?.role || subject.replace(/^(fw|fwd|re)\s*:\s*/gi, "").trim() || subject;

      // Skip leads where we truly can't determine the company — don't store "Unknown"
      const URL_PROTOCOL = /^(https?|http|ftp|www)$/i;
      if (!finalCompany || /^(unknown|n\/a|none)$/i.test(finalCompany) || URL_PROTOCOL.test(finalCompany.trim())) {
        existingUids.add(msg.id);
        skipped++;
        if (processedLabelId) labelMessage(tokens.access_token, msg.id, processedLabelId).catch(() => {});
        continue;
      }

      await supabase.from("pipeline_leads").insert({
        clerk_user_id: userId,
        company: finalCompany,
        role: finalRole,
        source_platform: platform,
        email_uid: msg.id,
        email_date: emailDate,
        raw_subject: subject,
        description_text: singleText,
        status: "promoted",
        score_overall: singleScore.score.overall,
        score_match_percentage: singleScore.score.match_percentage,
        score_details: {
          strong_count: singleScore.score.strong_count,
          partial_count: singleScore.score.partial_count,
          gap_count: singleScore.score.gap_count,
        },
        red_flags: singleScore.red_flags,
        created_at: new Date().toISOString(),
      });

      // Auto-promote: create application immediately
      const { data: newApp } = await supabase.from("applications").insert({
        clerk_user_id: userId,
        company: finalCompany,
        role: finalRole,
        source: platform ?? "Email Pipeline",
        job_description: singleText,
        status: "pending_review",
        email_uid: msg.id,
      }).select("id").single();

      // Create match_scores for the auto-promoted application
      if (newApp) {
        await supabase.from("match_scores").insert({
          application_id: newApp.id,
          clerk_user_id: userId,
          overall: singleScore.score.overall,
          match_percentage: singleScore.score.match_percentage,
          strong_count: singleScore.score.strong_count,
          partial_count: singleScore.score.partial_count,
          gap_count: singleScore.score.gap_count,
          red_flags: singleScore.red_flags,
        });
      }

      existingUids.add(msg.id);
      inserted++;
      if (processedLabelId) labelMessage(tokens.access_token, msg.id, processedLabelId).catch(() => {});
    }

    // Update last_fetch_at
    await supabase
      .from("email_connections")
      .update({ last_fetch_at: new Date().toISOString() })
      .eq("clerk_user_id", userId);

    return NextResponse.json({
      found: messages.length,
      inserted,
      confirmed,
      skipped: messages.length - inserted - confirmed,
    });
  } catch (err) {
    console.error("Gmail sync error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
