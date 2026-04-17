import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  scanWorkday,
  WorkdayAuthError,
  WorkdayRateLimitError,
} from "../../src/career-scan/vendors/workday";

const CSRF_HTML = `<html><head></head><body>
<script>window.csrfToken = "test-csrf-abc123";</script>
</body></html>`;

const CXS_RESPONSE = {
  jobPostings: [
    {
      title: "Director of Engineering",
      externalPath: "/job/Louisville-KY/Director-Engineering/R-111",
      locationsText: "Louisville, KY",
      subtitleText: "Engineering",
    },
    {
      title: "Engineering Manager, Data Platform",
      externalPath: "/job/Remote/EM-Data-Platform/R-222",
      locationsText: "US Remote",
      subtitleText: "Data",
    },
  ],
  total: 2,
};

function mockFetchResponse(body: string, init?: ResponseInit): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function mockLandingResponse(html: string, extraHeaders?: Record<string, string>): Response {
  const headers = new Headers({ "content-type": "text/html", ...extraHeaders });
  // Simulate set-cookie
  return new Response(html, { status: 200, headers });
}

describe("scanWorkday", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("normalizes CxS response into JobListing[]", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockLandingResponse(CSRF_HTML))
      .mockResolvedValueOnce(
        mockFetchResponse(JSON.stringify(CXS_RESPONSE))
      );
    global.fetch = fetchMock;

    const results = await scanWorkday("fakeco/wd5/External_Career_Site");
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      externalId: "/job/Louisville-KY/Director-Engineering/R-111",
      title: "Director of Engineering",
      url: "https://fakeco.wd5.myworkdayjobs.com/job/Louisville-KY/Director-Engineering/R-111",
      location: "Louisville, KY",
      department: "Engineering",
    });
  });

  it("uses externalPath as externalId, not a random UUID", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockLandingResponse(CSRF_HTML))
      .mockResolvedValueOnce(
        mockFetchResponse(JSON.stringify(CXS_RESPONSE))
      );
    global.fetch = fetchMock;

    const results = await scanWorkday("fakeco/wd5/Site");
    for (const job of results) {
      expect(job.externalId).toMatch(/^\/job\//);
    }
  });

  it(
    "keeps paginating when later pages return total=0 but still have jobs (Cigna bug)",
    async () => {
      // Page 1 reports total=60 and returns 20 jobs.
      // Pages 2+ return total=0 (tenant bug) but still deliver 20 jobs each.
      // Scanner should keep fetching until an empty page, not bail on total=0.
      const buildPage = (
        total: number,
        start: number,
        count: number
      ): string =>
        JSON.stringify({
          total,
          jobPostings: Array.from({ length: count }, (_, i) => ({
            title: `Job ${start + i}`,
            externalPath: `/job/loc/role/R-${start + i}`,
            locationsText: "Remote",
            subtitleText: "Eng",
          })),
        });

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(mockLandingResponse(CSRF_HTML))
        .mockResolvedValueOnce(mockFetchResponse(buildPage(60, 0, 20)))
        .mockResolvedValueOnce(mockFetchResponse(buildPage(0, 20, 20)))
        .mockResolvedValueOnce(mockFetchResponse(buildPage(0, 40, 20)))
        .mockResolvedValueOnce(mockFetchResponse(buildPage(0, 60, 0)));
      global.fetch = fetchMock;

      const results = await scanWorkday("fakeco/wd5/Site");
      expect(results).toHaveLength(60);
    }
  );

  it("sends empty appliedFacets by default", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockLandingResponse(CSRF_HTML))
      .mockResolvedValueOnce(
        mockFetchResponse(JSON.stringify({ jobPostings: [], total: 0 }))
      );
    global.fetch = fetchMock;

    await scanWorkday("fakeco/wd5/Site");

    const postCall = fetchMock.mock.calls.find(
      (c: unknown[]) => (c[1] as Record<string, unknown>)?.method === "POST"
    );
    const body = JSON.parse(
      (postCall![1] as { body: string }).body
    ) as { appliedFacets: Record<string, string[]> };
    expect(body.appliedFacets).toEqual({});
  });

  it("forwards appliedFacets from ScanContext into CxS POST body", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockLandingResponse(CSRF_HTML))
      .mockResolvedValueOnce(
        mockFetchResponse(JSON.stringify({ jobPostings: [], total: 0 }))
      );
    global.fetch = fetchMock;

    const appliedFacets = {
      jobFamilyGroup: [
        "e65dbadf6a50100168ed86fe4cf50001",
        "e65dbadf6a50100168ed7f2a693c0001",
      ],
    };

    await scanWorkday("fakeco/wd5/Site", {
      supabase: {} as never,
      userId: "user_x",
      allowLlmFallback: false,
      appliedFacets,
    });

    const postCall = fetchMock.mock.calls.find(
      (c: unknown[]) => (c[1] as Record<string, unknown>)?.method === "POST"
    );
    const body = JSON.parse(
      (postCall![1] as { body: string }).body
    ) as { appliedFacets: Record<string, string[]> };
    expect(body.appliedFacets).toEqual(appliedFacets);
  });

  it("sends CSRF token in POST headers", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockLandingResponse(CSRF_HTML))
      .mockResolvedValueOnce(
        mockFetchResponse(JSON.stringify({ jobPostings: [], total: 0 }))
      );
    global.fetch = fetchMock;

    await scanWorkday("fakeco/wd5/Site");

    // Find the POST call (second call after the landing GET)
    const postCall = fetchMock.mock.calls.find(
      (c: unknown[]) => (c[1] as Record<string, unknown>)?.method === "POST"
    );
    expect(postCall).toBeTruthy();
    const headers = (postCall![1] as Record<string, Record<string, string>>).headers;
    expect(headers["X-Calypso-CSRF-Token"]).toBe("test-csrf-abc123");
  });

  it("throws WorkdayRateLimitError after two 429s", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockLandingResponse(CSRF_HTML))
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response("", { status: 429 }));
    global.fetch = fetchMock;

    await expect(scanWorkday("fakeco/wd5/Site")).rejects.toThrow(
      WorkdayRateLimitError
    );
  }, 15_000);

  it("throws WorkdayAuthError on 401", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 })
    );
    global.fetch = fetchMock;

    await expect(scanWorkday("fakeco/wd5/Site")).rejects.toThrow(
      WorkdayAuthError
    );
  });

  it("throws WorkdayAuthError when login form detected", async () => {
    const authHtml = '<html><body><form action="/login" method="post"></form></body></html>';
    const fetchMock = vi.fn().mockResolvedValueOnce(
      mockLandingResponse(authHtml)
    );
    global.fetch = fetchMock;

    await expect(scanWorkday("fakeco/wd5/Site")).rejects.toThrow(
      WorkdayAuthError
    );
  });

  it("returns empty when CSRF missing and no LLM context", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      mockLandingResponse("<html><body>No CSRF here</body></html>")
    );
    global.fetch = fetchMock;

    const results = await scanWorkday("fakeco/wd5/Site");
    expect(results).toEqual([]);
  });

  it("returns empty on non-JSON POST response without LLM context", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockLandingResponse(CSRF_HTML))
      .mockResolvedValueOnce(
        new Response("<html>Not JSON</html>", { status: 200 })
      );
    global.fetch = fetchMock;

    const results = await scanWorkday("fakeco/wd5/Site");
    expect(results).toEqual([]);
  });

  it("rejects invalid identifier format", async () => {
    await expect(scanWorkday("bad-identifier")).rejects.toThrow(
      /Invalid Workday identifier/
    );
  });

  it("paginates until total is reached", async () => {
    // PAGE_SIZE is 20, so total=25 forces a second page fetch
    const jobs1 = Array.from({ length: 20 }, (_, i) => ({
      title: `Job ${i + 1}`,
      externalPath: `/j/${i + 1}`,
      locationsText: "",
      subtitleText: "",
    }));
    const jobs2 = Array.from({ length: 5 }, (_, i) => ({
      title: `Job ${i + 21}`,
      externalPath: `/j/${i + 21}`,
      locationsText: "",
      subtitleText: "",
    }));

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockLandingResponse(CSRF_HTML))
      .mockResolvedValueOnce(
        mockFetchResponse(JSON.stringify({ jobPostings: jobs1, total: 25 }))
      )
      .mockResolvedValueOnce(
        mockFetchResponse(JSON.stringify({ jobPostings: jobs2, total: 25 }))
      );
    global.fetch = fetchMock;

    const results = await scanWorkday("fakeco/wd5/Site");
    expect(results).toHaveLength(25);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
