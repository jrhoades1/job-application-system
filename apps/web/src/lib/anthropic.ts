import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthenticatedClient } from "./supabase";
import {
  checkApplicationQuota,
  incrementApplicationUsage,
} from "./metering";

let _anthropic: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return _anthropic;
}

// Model pricing per 1M tokens (from DSF cost-tracking skill)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-20250514": { input: 15.0, output: 75.0 },
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5-20251001": { input: 0.25, output: 1.25 },
};

function calculateCost(
  model: string,
  usage: { input_tokens: number; output_tokens: number }
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    console.warn(`Unknown model pricing: ${model}, estimating with Sonnet rates`);
    const fallback = MODEL_PRICING["claude-sonnet-4-20250514"];
    return (
      (usage.input_tokens / 1_000_000) * fallback.input +
      (usage.output_tokens / 1_000_000) * fallback.output
    );
  }
  return (
    (usage.input_tokens / 1_000_000) * pricing.input +
    (usage.output_tokens / 1_000_000) * pricing.output
  );
}

export class SpendCapExceededError extends Error {
  constructor(
    public currentSpend: number,
    public cap: number
  ) {
    super(
      `Monthly AI spend cap exceeded: $${currentSpend.toFixed(2)} / $${cap.toFixed(2)}`
    );
    this.name = "SpendCapExceededError";
  }
}

export class ApplicationQuotaExceededError extends Error {
  constructor(
    public used: number,
    public cap: number
  ) {
    super(
      `Application quota exceeded: ${used} / ${cap} applications used this period`
    );
    this.name = "ApplicationQuotaExceededError";
  }
}

/**
 * Core tracked message implementation — shared by user-session and cron-initiated calls.
 * When applicationId is provided, enforces application-count metering.
 * When applicationId is null/undefined (pipeline/system calls), allows through.
 */
async function createTrackedMessageCore(
  params: Anthropic.MessageCreateParams,
  generationType: string,
  supabase: SupabaseClient,
  userId: string,
  applicationId?: string
): Promise<Anthropic.Message> {

  // 1. Check application quota (replaces USD-based spend cap)
  let isNewApplication = false;

  if (applicationId) {
    const quota = await checkApplicationQuota(supabase, userId, applicationId);
    if (!quota.allowed) {
      throw new ApplicationQuotaExceededError(
        quota.used,
        quota.cap + quota.topOff
      );
    }
    isNewApplication = quota.isNewApplication;
  }

  // 2. Make the API call (non-streaming)
  const startTime = Date.now();
  const response = await getAnthropic().messages.create({
    ...params,
    stream: false,
  });
  const durationMs = Date.now() - startTime;

  // 3. Calculate cost and log
  const cost = calculateCost(params.model, response.usage);

  await supabase.from("ai_generations").insert({
    clerk_user_id: userId,
    application_id: applicationId ?? null,
    generation_type: generationType,
    model_used: params.model,
    tokens_input: response.usage.input_tokens,
    tokens_output: response.usage.output_tokens,
    cost_usd: cost,
    duration_ms: durationMs,
  });

  // 4. Increment application usage if this is a new application
  if (applicationId && isNewApplication) {
    const incremented = await incrementApplicationUsage(supabase, userId);
    if (!incremented) {
      // Race condition: another request consumed the last slot.
      // The AI call already ran, so we log but don't fail.
      console.warn(
        `Application usage increment failed for user ${userId} — possible race condition`
      );
    }
  }

  return response;
}

/**
 * Create a tracked AI message. Enforces application quota and logs usage.
 * Requires an active Clerk session — use createTrackedMessageForUser for cron/service contexts.
 * Pass applicationId to enforce metering; omit for pipeline/system calls.
 */
export async function createTrackedMessage(
  params: Anthropic.MessageCreateParams,
  generationType: string,
  applicationId?: string
): Promise<Anthropic.Message> {
  const { supabase, userId } = await getAuthenticatedClient();
  return createTrackedMessageCore(params, generationType, supabase, userId, applicationId);
}

/**
 * Create a tracked AI message with an explicit supabase client + userId.
 * Use in cron jobs or server-to-server calls where there's no Clerk session.
 * Pass applicationId to enforce metering; omit for pipeline/system calls.
 */
export async function createTrackedMessageForUser(
  params: Anthropic.MessageCreateParams,
  generationType: string,
  supabase: SupabaseClient,
  userId: string,
  applicationId?: string
): Promise<Anthropic.Message> {
  return createTrackedMessageCore(params, generationType, supabase, userId, applicationId);
}

export { getAnthropic as anthropic };
