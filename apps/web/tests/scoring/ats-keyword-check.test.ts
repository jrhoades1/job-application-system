import { describe, it, expect } from "vitest";
import { extractAtsKeywords, checkAtsKeywords } from "../../src/scoring";

describe("extractAtsKeywords", () => {
  it("extracts common tech keywords", () => {
    const jd = "We need someone with Python, AWS, and Kubernetes experience.";
    const result = extractAtsKeywords(jd);
    const keywords = result.map((r) => r.keyword.toLowerCase());
    expect(keywords).toContain("python");
    expect(keywords).toContain("aws");
    expect(keywords).toContain("kubernetes");
  });

  it("categorizes keywords correctly", () => {
    const jd = "HIPAA compliance with AWS and Agile methodology.";
    const result = extractAtsKeywords(jd);
    const byKw = new Map(result.map((r) => [r.keyword.toLowerCase(), r.category]));
    expect(byKw.get("hipaa")).toBe("certification");
    expect(byKw.get("aws")).toBe("tool");
    expect(byKw.get("agile")).toBe("methodology");
  });

  it("deduplicates repeated keywords", () => {
    const jd = "Python, Python, and more Python. Also Python.";
    const result = extractAtsKeywords(jd);
    const pythons = result.filter((r) => r.keyword.toLowerCase() === "python");
    expect(pythons).toHaveLength(1);
  });

  it("does not match Java inside JavaScript", () => {
    const jd = "Looking for JavaScript developer.";
    const result = extractAtsKeywords(jd);
    const keywords = result.map((r) => r.keyword.toLowerCase());
    expect(keywords).toContain("javascript");
    expect(keywords).not.toContain("java");
  });

  it("returns empty for empty JD", () => {
    expect(extractAtsKeywords("")).toEqual([]);
  });

  it("extracts healthcare domain terms", () => {
    const jd = "Must know HL7, FHIR, and EHR systems.";
    const result = extractAtsKeywords(jd);
    const keywords = result.map((r) => r.keyword.toLowerCase());
    expect(keywords).toContain("hl7");
    expect(keywords).toContain("fhir");
    expect(keywords).toContain("ehr");
  });
});

describe("checkAtsKeywords", () => {
  it("scores 100 when JD has no extractable keywords", () => {
    const result = checkAtsKeywords("any resume", "generic prose with no tech terms");
    expect(result.ats_score).toBe(100);
    expect(result.total).toBe(0);
  });

  it("flags missing keywords", () => {
    const jd = "Python, AWS, Kubernetes required.";
    const resume = "Experienced with Python and Docker.";
    const result = checkAtsKeywords(resume, jd);
    expect(result.found_count).toBeGreaterThanOrEqual(1);
    expect(result.missing).toContain("aws");
    expect(result.missing).toContain("kubernetes");
  });

  it("computes ats_score as percentage found", () => {
    const jd = "Python and AWS required.";
    const resume = "Python expert.";
    const result = checkAtsKeywords(resume, jd);
    expect(result.total).toBe(2);
    expect(result.found_count).toBe(1);
    expect(result.ats_score).toBe(50);
  });

  it("sorts missing keywords first", () => {
    const jd = "Python, AWS, Docker required.";
    const resume = "I know Python.";
    const result = checkAtsKeywords(resume, jd);
    const firstFound = result.keywords.findIndex((k) => k.found);
    const lastMissing = result.keywords.map((k) => k.found).lastIndexOf(false);
    expect(lastMissing).toBeLessThan(firstFound);
  });

  it("matching is case-insensitive", () => {
    const jd = "PYTHON and aws required.";
    const resume = "python and AWS experience.";
    const result = checkAtsKeywords(resume, jd);
    expect(result.missing_count).toBe(0);
    expect(result.ats_score).toBe(100);
  });

  it("returns complete keyword checklist", () => {
    const jd = "Python, Docker required.";
    const resume = "Python only.";
    const result = checkAtsKeywords(resume, jd);
    expect(result.keywords).toHaveLength(2);
    const python = result.keywords.find((k) => k.keyword.toLowerCase() === "python");
    const docker = result.keywords.find((k) => k.keyword.toLowerCase() === "docker");
    expect(python?.found).toBe(true);
    expect(docker?.found).toBe(false);
  });
});
