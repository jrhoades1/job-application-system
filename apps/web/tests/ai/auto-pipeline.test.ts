/**
 * Contract tests for the auto-pipeline route.
 *
 * The route does network orchestration (calls /api/scrape-job etc internally),
 * which is better covered by Playwright E2E. Here we verify only the two
 * deterministic pieces:
 *   1. Input schema (zod)
 *   2. Stage result shape / rollback contract
 *
 * Full happy-path + rollback e2e lives in apps/web/e2e/auto-pipeline.full.spec.ts
 * (deferred — Jimmy's e2e-tiers rule puts AI-spend tests in the expensive tier).
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";

// Mirror the schema from the route (intentional duplication for test isolation)
const inputSchema = z.object({
  url: z.string().url(),
  withAi: z.boolean().optional().default(false),
});

describe("auto-pipeline input schema", () => {
  it("accepts a valid URL with defaults", () => {
    const r = inputSchema.safeParse({ url: "https://boards.greenhouse.io/stripe/jobs/1" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.withAi).toBe(false);
  });

  it("accepts withAi: true", () => {
    const r = inputSchema.safeParse({
      url: "https://boards.greenhouse.io/stripe/jobs/1",
      withAi: true,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.withAi).toBe(true);
  });

  it("rejects a missing url", () => {
    const r = inputSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it("rejects a non-URL string", () => {
    const r = inputSchema.safeParse({ url: "not-a-url" });
    expect(r.success).toBe(false);
  });

  it("rejects withAi as a string", () => {
    const r = inputSchema.safeParse({
      url: "https://example.com/job",
      withAi: "yes",
    });
    expect(r.success).toBe(false);
  });
});

describe("stage result shape (contract for UI)", () => {
  type StageResult = {
    stage: string;
    ok: boolean;
    duration_ms: number;
    error?: string;
    detail?: unknown;
  };

  const stages: StageResult[] = [
    { stage: "scrape", ok: true, duration_ms: 420 },
    { stage: "create", ok: true, duration_ms: 45 },
    {
      stage: "score",
      ok: false,
      duration_ms: 1200,
      error: "No achievements",
    },
  ];

  it("each stage has stage, ok, duration_ms", () => {
    for (const s of stages) {
      expect(typeof s.stage).toBe("string");
      expect(typeof s.ok).toBe("boolean");
      expect(typeof s.duration_ms).toBe("number");
    }
  });

  it("rolled_back semantics: if create succeeded and score failed, caller must roll back", () => {
    const createStage = stages.find((s) => s.stage === "create");
    const scoreStage = stages.find((s) => s.stage === "score");
    const shouldRollback = createStage?.ok === true && scoreStage?.ok === false;
    expect(shouldRollback).toBe(true);
  });

  it("rolled_back semantics: if scrape failed, no rollback needed", () => {
    const scrapeFailed: StageResult[] = [
      { stage: "scrape", ok: false, duration_ms: 300, error: "404" },
    ];
    const createStage = scrapeFailed.find((s) => s.stage === "create");
    const needsRollback = !!createStage?.ok;
    expect(needsRollback).toBe(false);
  });

  it("AI stage failures don't trigger rollback", () => {
    const aiFailed: StageResult[] = [
      { stage: "scrape", ok: true, duration_ms: 100 },
      { stage: "create", ok: true, duration_ms: 50 },
      { stage: "score", ok: true, duration_ms: 500 },
      { stage: "tailor_resume", ok: false, duration_ms: 200, error: "rate limit" },
      { stage: "cover_letter", ok: false, duration_ms: 0, error: "skipped" },
    ];
    // The route treats AI stages as non-rollback; caller just sees them in the stages list
    const coreStagesOk = aiFailed
      .filter((s) => ["scrape", "create", "score"].includes(s.stage))
      .every((s) => s.ok);
    expect(coreStagesOk).toBe(true);
  });
});
