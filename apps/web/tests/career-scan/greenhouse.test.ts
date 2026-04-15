import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { scanGreenhouse } from "../../src/career-scan/vendors/greenhouse";

const FIXTURE_RESPONSE = {
  jobs: [
    {
      id: 12345,
      title: "Senior Software Engineer",
      absolute_url: "https://boards.greenhouse.io/fakeco/jobs/12345",
      location: { name: "Remote — US" },
      departments: [{ name: "Engineering" }],
    },
    {
      id: "67890",
      title: "VP of Engineering",
      absolute_url: "https://boards.greenhouse.io/fakeco/jobs/67890",
      location: null,
      departments: [],
    },
  ],
};

describe("scanGreenhouse", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("normalizes Greenhouse JSON into JobListing[]", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify(FIXTURE_RESPONSE), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const results = await scanGreenhouse("fakeco");
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      externalId: "12345",
      title: "Senior Software Engineer",
      url: "https://boards.greenhouse.io/fakeco/jobs/12345",
      location: "Remote — US",
      department: "Engineering",
    });
    expect(results[1]).toEqual({
      externalId: "67890",
      title: "VP of Engineering",
      url: "https://boards.greenhouse.io/fakeco/jobs/67890",
      location: undefined,
      department: undefined,
    });
  });

  it("calls the expected API URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jobs: [] }), { status: 200 })
    );
    global.fetch = fetchMock;

    await scanGreenhouse("stripe");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://boards-api.greenhouse.io/v1/boards/stripe/jobs",
      expect.objectContaining({ headers: expect.any(Object) })
    );
  });

  it("throws on non-2xx response", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("not found", { status: 404 })
    );
    await expect(scanGreenhouse("doesnotexist")).rejects.toThrow(/404/);
  });

  it("rejects invalid slug without calling fetch", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    await expect(scanGreenhouse("bad slug!")).rejects.toThrow(/Invalid/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns empty array when vendor returns empty jobs", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ jobs: [] }), { status: 200 })
    );
    expect(await scanGreenhouse("emptyco")).toEqual([]);
  });
});
