import { describe, it, expect } from "vitest";
import { detectVendor } from "../../src/career-scan";

describe("detectVendor", () => {
  it("detects Greenhouse boards URL", () => {
    expect(detectVendor("https://boards.greenhouse.io/stripe")).toEqual({
      vendor: "greenhouse",
      identifier: "stripe",
    });
  });

  it("detects Greenhouse EU boards URL", () => {
    expect(detectVendor("https://boards.eu.greenhouse.io/monzo")).toEqual({
      vendor: "greenhouse",
      identifier: "monzo",
    });
  });

  it("detects Greenhouse job-boards prefix", () => {
    expect(detectVendor("https://job-boards.greenhouse.io/anthropic")).toEqual({
      vendor: "greenhouse",
      identifier: "anthropic",
    });
  });

  it("detects Lever URL", () => {
    expect(detectVendor("https://jobs.lever.co/netflix")).toEqual({
      vendor: "lever",
      identifier: "netflix",
    });
  });

  it("detects Ashby URL with trailing path", () => {
    expect(
      detectVendor("https://jobs.ashbyhq.com/anthropic/some-role-uuid")
    ).toEqual({ vendor: "ashby", identifier: "anthropic" });
  });

  it("detects SmartRecruiters URL", () => {
    expect(
      detectVendor("https://careers.smartrecruiters.com/Bosch")
    ).toEqual({ vendor: "smartrecruiters", identifier: "bosch" });
  });

  it("detects Workday legacy URL with tenant/wdN/site", () => {
    expect(
      detectVendor("https://humana.wd5.myworkdayjobs.com/Humana_External_Career_Site")
    ).toEqual({
      vendor: "workday",
      identifier: "humana/wd5/Humana_External_Career_Site",
    });
  });

  it("detects Workday localized URL (en-US prefix)", () => {
    expect(
      detectVendor("https://merck.wd5.myworkdayjobs.com/en-US/SearchJobs")
    ).toEqual({ vendor: "workday", identifier: "merck/wd5/SearchJobs" });
  });

  it("detects Workday myworkdaysite.com URL", () => {
    expect(
      detectVendor(
        "https://wd5.myworkdaysite.com/recruiting/humana/Humana_External_Career_Site/jobs"
      )
    ).toEqual({
      vendor: "workday",
      identifier: "humana/wd5/Humana_External_Career_Site",
    });
  });

  it("returns null for Workday URL without site segment", () => {
    expect(
      detectVendor("https://humana.wd5.myworkdayjobs.com/")
    ).toBeNull();
  });

  it("detects iCIMS URL", () => {
    expect(
      detectVendor("https://careers-servicetitan.icims.com/jobs")
    ).toEqual({ vendor: "icims", identifier: "servicetitan" });
  });

  it("lowercases identifiers", () => {
    expect(detectVendor("https://boards.greenhouse.io/Stripe")?.identifier).toBe(
      "stripe"
    );
  });

  it("returns null for unrecognized URL", () => {
    expect(detectVendor("https://example.com/careers")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(detectVendor("")).toBeNull();
    expect(detectVendor("   ")).toBeNull();
  });
});
