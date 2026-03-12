import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";
import { extractJobsFromEmail, type ExtractedJob } from "@/lib/extract-jobs";
import {
  getGmailTokens,
  listGmailMessages,
  getGmailMessage,
  getHeader,
  extractEmailText,
  computeEmailFingerprint,
} from "@/lib/gmail";
import {
  extractRequirements,
  scoreRequirement,
  calculateOverallScore,
} from "@/scoring";

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

function isJobEmail(from: string, subject: string, body: string): boolean {
  // Always accept forwarded emails — user explicitly forwarded it, so they want it tracked
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
    // 2. Badly parsed — company is "Fw", "Fwd", "Re", or empty
    const BAD_COMPANY = /^(fw|fwd|re|)$/i;
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

    function scoreLead(descriptionText: string) {
      const reqs = extractRequirements(descriptionText);
      const allReqs = [...reqs.hard_requirements, ...reqs.preferred];
      const matches = allReqs.map((r) => scoreRequirement(r, achievementsMap));
      const score = calculateOverallScore(matches);
      return { score, red_flags: reqs.red_flags };
    }

    let inserted = 0;
    let skipped = 0;

    for (const msg of messages) {
      // Skip if base email ID or any multi-job variant already exists
      // (reparse renames originals to {uid}_0, so check that too)
      if (
        existingUids.has(msg.id) ||
        existingUids.has(`${msg.id}_0`) ||
        existingUids.has(`${msg.id}_1`)
      ) {
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

        for (let i = 0; i < jobs.length; i++) {
          const job = jobs[i];
          const leadUid = `${msg.id}_${i}`;

          if (existingUids.has(leadUid)) continue;

          const leadText = body.slice(0, 5000);
          const leadScore = scoreLead(leadText);

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

      // Single-job email: extract from subject and auto-promote
      const extracted = extractCompanyRole(subject);
      const singleText = body.slice(0, 5000);
      const singleScore = scoreLead(singleText);

      await supabase.from("pipeline_leads").insert({
        clerk_user_id: userId,
        company: extracted?.company ?? "",
        role: extracted?.role ?? "",
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
        company: extracted?.company || subject,
        role: extracted?.role || subject,
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
    }

    // Update last_fetch_at
    await supabase
      .from("email_connections")
      .update({ last_fetch_at: new Date().toISOString() })
      .eq("clerk_user_id", userId);

    return NextResponse.json({
      found: messages.length,
      inserted,
      skipped: messages.length - inserted,
    });
  } catch (err) {
    console.error("Gmail sync error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
