import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { scanIcims, IcimsAuthError } from "../../src/career-scan/vendors/icims";
import * as llmExtract from "../../src/career-scan/llm-extract";

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html" },
  });
}

describe("scanIcims", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("extracts jobs directly when the HTML has iCIMS job anchors", async () => {
    const html = `<html><body>
      <a href="/jobs/12345/senior-software-engineer/job" class="iCIMS_Anchor">
        <h3 class="iCIMS_Title">Senior Software Engineer</h3>
      </a>
      <a href="/jobs/12346/engineering-manager/job" class="iCIMS_Anchor">
        <h3 class="iCIMS_Title">Engineering Manager</h3>
      </a>
      <a href="/jobs/12347/director-of-platform/job" class="iCIMS_Anchor">
        <h3 class="iCIMS_Title">Director of Platform</h3>
      </a>
    </body></html>`;
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      htmlResponse(html)
    );

    const results = await scanIcims("hcsgcorp");
    expect(results).toHaveLength(3);
    expect(results[0].externalId).toBe("12345");
    expect(results[0].url).toBe(
      "https://careers-hcsgcorp.icims.com/jobs/12345/senior-software-engineer/job"
    );
    expect(results[0].title).toMatch(/Senior Software Engineer/);
  });

  it("deduplicates when the same job ID appears in multiple anchors", async () => {
    const html = `
      <a href="/jobs/888/lead-eng/job">Lead Engineer</a>
      <a href="/jobs/888/lead-eng/apply">Apply Now</a>
      <a href="/jobs/889/staff-eng/job">Staff Engineer</a>
      <a href="/jobs/890/principal/job">Principal</a>`;
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      htmlResponse(html)
    );

    const results = await scanIcims("hcsgcorp");
    expect(results.map((r) => r.externalId).sort()).toEqual([
      "888",
      "889",
      "890",
    ]);
  });

  it("throws IcimsAuthError on 401", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      htmlResponse("", 401)
    );
    await expect(scanIcims("hcsgcorp")).rejects.toBeInstanceOf(IcimsAuthError);
  });

  it("throws IcimsAuthError when landing page renders a login form", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      htmlResponse(
        `<html><body><form class="login-form"><input name="password"></form></body></html>`
      )
    );
    await expect(scanIcims("hcsgcorp")).rejects.toBeInstanceOf(IcimsAuthError);
  });

  it("falls back to LLM extraction when direct parse finds <3 jobs", async () => {
    const html = `<html><body>
      <div class="spa-loader">Loading...</div>
      <a href="/jobs/1/only-one/job">Only Job</a>
    </body></html>`;
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      htmlResponse(html)
    );

    const llmSpy = vi
      .spyOn(llmExtract, "extractJobsFromHtml")
      .mockResolvedValueOnce([
        {
          externalId: "/jobs/900/from-llm/job",
          title: "From LLM",
          url: "https://careers-acme.icims.com/jobs/900/from-llm/job",
        },
      ]);

    const results = await scanIcims("acme", {
      supabase: {} as never,
      userId: "user_1",
      allowLlmFallback: true,
    });
    expect(llmSpy).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("From LLM");
  });

  it("skips LLM fallback when allowLlmFallback is false", async () => {
    const html = `<html><body><!-- empty spa --></body></html>`;
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      htmlResponse(html)
    );
    const llmSpy = vi.spyOn(llmExtract, "extractJobsFromHtml");

    const results = await scanIcims("acme", {
      supabase: {} as never,
      userId: "user_1",
      allowLlmFallback: false,
    });
    expect(llmSpy).not.toHaveBeenCalled();
    expect(results).toEqual([]);
  });

  it("rejects malformed identifiers", async () => {
    await expect(scanIcims("not a slug!")).rejects.toThrow(
      /invalid.*identifier/i
    );
  });
});
