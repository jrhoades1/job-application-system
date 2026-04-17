import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  scanRadancy,
  RadancyRateLimitError,
  detectRadancyAsync,
} from "../../src/career-scan/vendors/radancy";

/**
 * Build a minimal Radancy-shaped JSON response. `results` is an HTML chunk
 * with the metadata section plus N job <li> cards.
 */
function buildRadancyPayload(
  jobs: Array<{ id: string; title: string; path: string; location?: string }>,
  total?: number
): string {
  const totalResults = total ?? jobs.length;
  const jobsHtml = jobs
    .map(
      (j) => `<li>
<a href="${j.path}" data-job-id="${j.id}" class="brand-facet">
<div>
<h2>${j.title}</h2>
<span class="job-id">${j.id}</span>
<span class="job-location">${j.location ?? ""}</span>
</div>
</a>
</li>`
    )
    .join("\n");

  const resultsHtml = `<section id="search-results" data-total-results="${totalResults}" data-total-pages="1" data-current-page="1" data-records-per-page="100">
<ul>${jobsHtml}</ul>
</section>`;

  return JSON.stringify({
    filters: "",
    results: resultsHtml,
    hasJobs: jobs.length > 0,
    hasContent: false,
  });
}

function mockJson(body: string, init?: ResponseInit): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("scanRadancy", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("parses job list from embedded HTML chunk", async () => {
    const body = buildRadancyPayload([
      {
        id: "94063888001",
        title: "Director of Engineering",
        path: "/job/minneapolis/director-engineering/67476/94063888001",
        location: "Minneapolis, MN",
      },
      {
        id: "94063888002",
        title: "Senior Software Engineer",
        path: "/job/remote/sr-swe/67476/94063888002",
        location: "Remote",
      },
    ]);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockJson(body)
    );

    const results = await scanRadancy("careers.unitedhealthgroup.com/67476");
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      externalId: "94063888001",
      title: "Director of Engineering",
      url: "https://careers.unitedhealthgroup.com/job/minneapolis/director-engineering/67476/94063888001",
      location: "Minneapolis, MN",
    });
  });

  it("returns [] when hasJobs is false", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockJson(
        JSON.stringify({
          filters: "",
          results: "",
          hasJobs: false,
          hasContent: false,
        })
      )
    );
    const results = await scanRadancy("careers.example.com/12345");
    expect(results).toEqual([]);
  });

  it("throws when response isn't valid JSON", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response("<html>503 service unavailable</html>", { status: 200 })
    );
    await expect(scanRadancy("careers.example.com/12345")).rejects.toThrow(
      /shape changed/i
    );
  });

  it(
    "retries once on 429 then succeeds",
    async () => {
      const body = buildRadancyPayload([
        {
          id: "1",
          title: "Job A",
          path: "/job/a/1/1",
        },
      ]);
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response("", { status: 429 }))
        .mockResolvedValueOnce(mockJson(body));
      global.fetch = fetchMock;

      const results = await scanRadancy("careers.example.com/999");
      expect(results).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
    10_000
  );

  it(
    "throws RadancyRateLimitError after two 429s",
    async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response("", { status: 429 }))
        .mockResolvedValueOnce(new Response("", { status: 429 }));
      global.fetch = fetchMock;

      await expect(
        scanRadancy("careers.example.com/999")
      ).rejects.toBeInstanceOf(RadancyRateLimitError);
    },
    10_000
  );

  it("throws on invalid identifier shape", async () => {
    await expect(scanRadancy("not-a-valid-identifier")).rejects.toThrow(
      /invalid.*identifier/i
    );
  });
});

describe("detectRadancyAsync", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("extracts {hostname}/{companySiteId} when TalentBrew markers present", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        `<html><head>
          <link rel="stylesheet" href="//tbcdn.talentbrew.com/main.css">
        </head>
        <body data-company-site-id="67476" data-cdnv="//tbcdn.talentbrew.com/">
          <h1>Careers</h1>
        </body></html>`,
        { status: 200, headers: { "content-type": "text/html" } }
      )
    );

    const id = await detectRadancyAsync(
      "https://careers.unitedhealthgroup.com/"
    );
    expect(id).toBe("careers.unitedhealthgroup.com/67476");
  });

  it("returns null when page has no TalentBrew markers", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(`<html><body>not a radancy site</body></html>`, {
        status: 200,
      })
    );
    const id = await detectRadancyAsync("https://example.com/");
    expect(id).toBeNull();
  });

  it("returns null when marker exists but company-site-id is missing", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        `<html><body>hello talentbrew but no site id</body></html>`,
        { status: 200 }
      )
    );
    const id = await detectRadancyAsync("https://example.com/");
    expect(id).toBeNull();
  });

  it("returns null on fetch error", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("network down")
    );
    const id = await detectRadancyAsync("https://example.com/");
    expect(id).toBeNull();
  });
});
