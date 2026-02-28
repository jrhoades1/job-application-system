import Anthropic from "@anthropic-ai/sdk";
import { getAuthenticatedClient } from "./supabase";

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

/**
 * Create a tracked AI message. Enforces spend caps and logs usage.
 */
export async function createTrackedMessage(
  params: Anthropic.MessageCreateParams,
  generationType: string
): Promise<Anthropic.Message> {
  const { supabase, userId } = await getAuthenticatedClient();

  // 1. Check monthly spend cap
  const { data: config } = await supabase
    .from("cost_config")
    .select("monthly_ai_cap_usd, block_on_cap, alert_threshold_pct")
    .eq("clerk_user_id", userId)
    .single();

  const cap = config?.monthly_ai_cap_usd ?? 10.0;
  const blockOnCap = config?.block_on_cap ?? true;

  const { data: spendData } = await supabase
    .from("ai_generations")
    .select("cost_usd")
    .eq("clerk_user_id", userId)
    .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());

  const monthlySpend = (spendData ?? []).reduce(
    (sum, row) => sum + (row.cost_usd ?? 0),
    0
  );

  if (blockOnCap && monthlySpend >= cap) {
    throw new SpendCapExceededError(monthlySpend, cap);
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
    generation_type: generationType,
    model_used: params.model,
    tokens_input: response.usage.input_tokens,
    tokens_output: response.usage.output_tokens,
    cost_usd: cost,
    duration_ms: durationMs,
  });

  // 4. Check alert thresholds
  const newTotal = monthlySpend + cost;
  const alertThreshold = (config?.alert_threshold_pct ?? 80) / 100;

  if (newTotal >= cap * alertThreshold && monthlySpend < cap * alertThreshold) {
    // Just crossed the warning threshold
    const { data: existingAlert } = await supabase
      .from("expense_alerts")
      .select("id")
      .eq("clerk_user_id", userId)
      .eq("alert_type", "monthly_cap_warning")
      .eq("resolved", false)
      .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
      .limit(1);

    if (!existingAlert?.length) {
      await supabase.from("expense_alerts").insert({
        clerk_user_id: userId,
        alert_type: "monthly_cap_warning",
        severity: "medium",
        threshold_value: cap * alertThreshold,
        actual_value: newTotal,
        message: `You've used ${Math.round((newTotal / cap) * 100)}% of your $${cap.toFixed(2)} monthly AI budget ($${newTotal.toFixed(2)}).`,
      });
    }
  }

  return response;
}

export { getAnthropic as anthropic };
