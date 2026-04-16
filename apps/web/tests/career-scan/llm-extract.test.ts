import { describe, it, expect, vi } from "vitest";
import { extractJobsFromHtml } from "../../src/career-scan/llm-extract";

vi.mock("../../src/lib/anthropic", () => ({
  createTrackedMessageForUser: vi.fn(),
}));

import { createTrackedMessageForUser } from "../../src/lib/anthropic";

const mockSupabase = {} as any;

describe("extractJobsFromHtml", () => {
  it("parses LLM JSON response into JobListing[]", async () => {
    const llmResponse = {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            jobs: [
              {
                title: "Director of Engineering",
                location: "Remote",
                url: "/job/director-eng/R-123",
                department: "Engineering",
              },
            ],
          }),
        },
      ],
    };
    vi.mocked(createTrackedMessageForUser).mockResolvedValue(llmResponse as any);

    const results = await extractJobsFromHtml(
      "<html><body><div>Director of Engineering</div></body></html>",
      "Humana",
      "https://humana.wd5.myworkdayjobs.com",
      mockSupabase,
      "user_123"
    );

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Director of Engineering");
    expect(results[0].url).toBe(
      "https://humana.wd5.myworkdayjobs.com/job/director-eng/R-123"
    );
  });

  it("returns empty array when LLM returns no jobs", async () => {
    vi.mocked(createTrackedMessageForUser).mockResolvedValue({
      content: [{ type: "text", text: '{"jobs": []}' }],
    } as any);

    const results = await extractJobsFromHtml(
      "<html></html>",
      "Humana",
      "https://example.com",
      mockSupabase,
      "user_123"
    );
    expect(results).toEqual([]);
  });

  it("returns empty on unparseable LLM response", async () => {
    vi.mocked(createTrackedMessageForUser).mockResolvedValue({
      content: [{ type: "text", text: "I cannot extract jobs from this." }],
    } as any);

    const results = await extractJobsFromHtml(
      "<html></html>",
      "Humana",
      "https://example.com",
      mockSupabase,
      "user_123"
    );
    expect(results).toEqual([]);
  });

  it("uses Haiku model", async () => {
    vi.mocked(createTrackedMessageForUser).mockResolvedValue({
      content: [{ type: "text", text: '{"jobs": []}' }],
    } as any);

    await extractJobsFromHtml(
      "<html></html>",
      "Humana",
      "https://example.com",
      mockSupabase,
      "user_123"
    );

    expect(createTrackedMessageForUser).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-haiku-4-5-20251001" }),
      "career_scan_llm_fallback",
      mockSupabase,
      "user_123"
    );
  });

  it("handles absolute URLs in LLM response", async () => {
    vi.mocked(createTrackedMessageForUser).mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            jobs: [
              {
                title: "EM",
                url: "https://external.com/job/123",
              },
            ],
          }),
        },
      ],
    } as any);

    const results = await extractJobsFromHtml(
      "<html></html>",
      "Test",
      "https://base.com",
      mockSupabase,
      "user_123"
    );
    expect(results[0].url).toBe("https://external.com/job/123");
  });
});
