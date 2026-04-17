import { describe, it, expect } from "vitest";
import { extractPostingId } from "@/lib/posting-id";

describe("extractPostingId", () => {
  it("parses LinkedIn /jobs/view/<id>/", () => {
    expect(
      extractPostingId(
        "https://www.linkedin.com/jobs/view/4402501651/?trk=foo&refId=bar"
      )
    ).toBe("linkedin:4402501651");
  });

  it("parses LinkedIn /comm/jobs/view/<id>/", () => {
    expect(
      extractPostingId(
        "https://www.linkedin.com/comm/jobs/view/4401186591/?trackingId=x"
      )
    ).toBe("linkedin:4401186591");
  });

  it("parses LinkedIn ?currentJobId= fallback", () => {
    expect(
      extractPostingId(
        "https://www.linkedin.com/jobs/search/?currentJobId=4399617838&keywords=whatever"
      )
    ).toBe("linkedin:4399617838");
  });

  it("parses Greenhouse board URLs", () => {
    expect(
      extractPostingId("https://boards.greenhouse.io/stripe/jobs/7028301")
    ).toBe("greenhouse:stripe:7028301");
    expect(
      extractPostingId(
        "https://job-boards.greenhouse.io/anthropic/jobs/1234567?gh_src=x"
      )
    ).toBe("greenhouse:anthropic:1234567");
  });

  it("parses Ashby URLs", () => {
    expect(
      extractPostingId(
        "https://jobs.ashbyhq.com/openai/12345678-90ab-cdef-1234-567890abcdef/application"
      )
    ).toBe("ashby:openai:12345678-90ab-cdef-1234-567890abcdef");
  });

  it("parses Lever URLs", () => {
    expect(
      extractPostingId(
        "https://jobs.lever.co/brex/a1b2c3d4-5678-9012-3456-7890abcdef12"
      )
    ).toBe("lever:brex:a1b2c3d4-5678-9012-3456-7890abcdef12");
  });

  it("parses Workday URLs", () => {
    expect(
      extractPostingId(
        "https://servicetitan.wd1.myworkdayjobs.com/External/job/Remote-US/Director-Engineering_R12345"
      )
    ).toBe("workday:Director-Engineering_R12345");
  });

  it("parses Built In URLs", () => {
    expect(
      extractPostingId(
        "https://builtin.com/job/director-software-engineering/8989144"
      )
    ).toBe("builtin:8989144");
  });

  it("returns null for unknown hosts", () => {
    expect(extractPostingId("https://example.com/careers/abc")).toBeNull();
  });

  it("returns null for empty / missing input", () => {
    expect(extractPostingId(null)).toBeNull();
    expect(extractPostingId(undefined)).toBeNull();
    expect(extractPostingId("")).toBeNull();
  });

  it("normalizes different LinkedIn URLs for the same posting to the same id", () => {
    const a =
      "https://www.linkedin.com/jobs/view/4402501651/?trk=eml&refId=abc";
    const b =
      "https://www.linkedin.com/comm/jobs/view/4402501651/?trackingId=zzz";
    expect(extractPostingId(a)).toBe(extractPostingId(b));
  });
});
