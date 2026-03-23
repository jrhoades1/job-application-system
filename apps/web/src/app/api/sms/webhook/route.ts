/**
 * SMS Webhook — POST /api/sms/webhook
 *
 * Receives inbound texts from Twilio, parses commands, and replies via TwiML.
 * Lead positions (1/2/3) resolve against the most recent digest_run's top_leads.
 *
 * Commands (case-insensitive):
 *   APPLY 1/2/3  — mark lead as promoted
 *   SKIP  1/2/3  — mark lead as skipped/archived
 *   INFO  1/2/3  — reply with full lead details + link
 *   ADD   [url]  — add a job URL as a new pending lead
 *   STATUS       — reply with active pending-review lead count
 *
 * Auth: Twilio HMAC-SHA1 webhook signature validation.
 * Route is excluded from Clerk middleware (see middleware.ts).
 */

import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";
import { validateTwilioSignature, twiml, twimlEmpty } from "@/lib/twilio";
import { isPrivateUrl } from "@/lib/scrape-helpers";

const XML_HEADERS = { "Content-Type": "text/xml" };

interface DigestLead {
  id: string;
  company: string;
  role: string;
  score_overall: string | null;
  score_match_percentage: number | null;
  career_page_url: string | null;
  location: string | null;
}

export async function POST(req: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error("[sms/webhook] TWILIO_AUTH_TOKEN not configured");
    return new NextResponse(twimlEmpty(), { headers: XML_HEADERS });
  }

  // Parse Twilio's form-encoded POST body
  const rawBody = await req.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));

  // Validate Twilio webhook signature
  const signature = req.headers.get("x-twilio-signature") ?? "";
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? `https://${process.env.VERCEL_URL}`;
  const webhookUrl = `${appUrl}/api/sms/webhook`;

  if (!validateTwilioSignature(authToken, signature, webhookUrl, params)) {
    console.warn("[sms/webhook] Rejected: invalid Twilio signature");
    return new NextResponse("Forbidden", { status: 403 });
  }

  const fromNumber = params.From ?? "";
  const rawMessage = (params.Body ?? "").trim();

  if (!fromNumber || !rawMessage) {
    return new NextResponse(twimlEmpty(), { headers: XML_HEADERS });
  }

  const supabase = getServiceRoleClient();

  // Look up user whose preferences.sms_number matches the sender
  const { data: profiles } = await supabase
    .from("profiles")
    .select("clerk_user_id")
    .filter("preferences->>sms_number", "eq", fromNumber)
    .limit(1);

  const userId = profiles?.[0]?.clerk_user_id;
  if (!userId) {
    console.warn(`[sms/webhook] No user found for number ${fromNumber}`);
    return new NextResponse(
      twiml("Number not registered. Add your phone in Settings > Profile."),
      { headers: XML_HEADERS }
    );
  }

  // Fetch the most recent digest run for position-based lead resolution
  const { data: latestRun } = await supabase
    .from("digest_runs")
    .select("top_leads")
    .eq("clerk_user_id", userId)
    .order("run_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const topLeads = (latestRun?.top_leads ?? []) as DigestLead[];

  // Parse verb (case-insensitive) while preserving argument casing (needed for URLs)
  const spaceIdx = rawMessage.indexOf(" ");
  const verb =
    spaceIdx === -1
      ? rawMessage.toUpperCase()
      : rawMessage.slice(0, spaceIdx).toUpperCase();
  const argStr = spaceIdx === -1 ? "" : rawMessage.slice(spaceIdx + 1).trim();
  const leadIndex = parseInt(argStr, 10); // 1-based; NaN if not a number

  const reply = await dispatch(
    verb,
    leadIndex,
    argStr,
    userId,
    topLeads,
    supabase,
    appUrl
  );

  return new NextResponse(twiml(reply), { headers: XML_HEADERS });
}

// ── Command dispatcher ─────────────────────────────────────────────────────────

async function dispatch(
  verb: string,
  leadIndex: number,
  argStr: string,
  userId: string,
  topLeads: DigestLead[],
  supabase: ReturnType<typeof getServiceRoleClient>,
  appUrl: string
): Promise<string> {
  switch (verb) {
    case "APPLY":
      return applyOrSkip("promoted", leadIndex, userId, topLeads, supabase);
    case "SKIP":
      return applyOrSkip("skipped", leadIndex, userId, topLeads, supabase);
    case "INFO":
      return infoCommand(leadIndex, userId, topLeads, supabase, appUrl);
    case "ADD":
      return addCommand(argStr, userId, supabase, appUrl);
    case "STATUS":
      return statusCommand(userId, supabase);
    default:
      return (
        "Commands:\n" +
        "APPLY 1/2/3 — mark applied\n" +
        "SKIP 1/2/3 — archive lead\n" +
        "INFO 1/2/3 — lead details\n" +
        "ADD [url] — add job URL\n" +
        "STATUS — active lead count"
      );
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function applyOrSkip(
  newStatus: "promoted" | "skipped",
  index: number,
  userId: string,
  topLeads: DigestLead[],
  supabase: ReturnType<typeof getServiceRoleClient>
): Promise<string> {
  const lead = resolveLead(index, topLeads);
  if (!lead) {
    return `No lead at position ${index}. Reply INFO to see today's top leads.`;
  }

  const { error } = await supabase
    .from("pipeline_leads")
    .update({
      status: newStatus,
      skip_reason: newStatus === "skipped" ? "sms_skip" : null,
    })
    .eq("id", lead.id)
    .eq("clerk_user_id", userId);

  if (error) {
    console.error("[sms/webhook] Update lead failed:", error);
    return "Couldn't update that lead. Try again or check the app.";
  }

  const label = newStatus === "promoted" ? "Applied ✓" : "Archived ✓";
  return `${label} — ${lead.company}: ${lead.role}`;
}

async function infoCommand(
  index: number,
  userId: string,
  topLeads: DigestLead[],
  supabase: ReturnType<typeof getServiceRoleClient>,
  appUrl: string
): Promise<string> {
  const lead = resolveLead(index, topLeads);
  if (!lead) {
    return `No lead at position ${index}. Reply STATUS to see your active leads.`;
  }

  const { data } = await supabase
    .from("pipeline_leads")
    .select(
      "company, role, location, compensation, score_match_percentage, career_page_url"
    )
    .eq("id", lead.id)
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (!data) return "Lead not found — it may have been removed.";

  const score = data.score_match_percentage
    ? `${Math.round(data.score_match_percentage)}%`
    : "unscored";
  const location = data.location ?? "Remote/Unknown";
  const salary = data.compensation ?? "Not listed";
  const link =
    data.career_page_url ?? `${appUrl}/dashboard/jobs?tab=leads`;

  return (
    `${data.role} @ ${data.company}\n` +
    `📍 ${location}\n` +
    `💰 ${salary}\n` +
    `📊 Match: ${score}\n` +
    `🔗 ${link}`
  );
}

async function addCommand(
  urlArg: string,
  userId: string,
  supabase: ReturnType<typeof getServiceRoleClient>,
  appUrl: string
): Promise<string> {
  if (!urlArg) {
    return "Usage: ADD [url] — e.g. ADD https://jobs.example.com/123";
  }

  // Normalise: prepend https:// if no scheme provided
  const raw = urlArg.startsWith("http") ? urlArg : `https://${urlArg}`;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(raw);
  } catch {
    return "Invalid URL. Example: ADD https://jobs.example.com/123";
  }

  if (isPrivateUrl(parsedUrl.toString())) {
    return "That URL isn't allowed (private or internal address).";
  }

  // Deduplicate by career_page_url
  const { data: existing } = await supabase
    .from("pipeline_leads")
    .select("id")
    .eq("clerk_user_id", userId)
    .eq("career_page_url", parsedUrl.toString())
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (existing) return "That URL is already in your pipeline.";

  const { error } = await supabase.from("pipeline_leads").insert({
    clerk_user_id: userId,
    company: parsedUrl.hostname.replace(/^www\./, ""),
    role: "Pending review",
    source_platform: "SMS",
    career_page_url: parsedUrl.toString(),
    status: "pending_review",
  });

  if (error) {
    console.error("[sms/webhook] Insert lead failed:", error);
    return "Couldn't add that URL. Try again or paste it into the app.";
  }

  return `Added! Open the app to score and review:\n${appUrl}/dashboard/jobs?tab=leads`;
}

async function statusCommand(
  userId: string,
  supabase: ReturnType<typeof getServiceRoleClient>
): Promise<string> {
  const { count } = await supabase
    .from("pipeline_leads")
    .select("id", { count: "exact", head: true })
    .eq("clerk_user_id", userId)
    .eq("status", "pending_review")
    .is("deleted_at", null);

  const n = count ?? 0;
  return `You have ${n} active lead${n !== 1 ? "s" : ""} pending review.`;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function resolveLead(index: number, leads: DigestLead[]): DigestLead | null {
  if (!Number.isInteger(index) || index < 1 || index > leads.length) {
    return null;
  }
  return leads[index - 1] ?? null;
}
