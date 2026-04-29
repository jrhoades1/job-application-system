import { describe, it, expect } from "vitest";
import { parseJobPostingJsonLd } from "../../extension/src/lib/parse-job-posting";

describe("parseJobPostingJsonLd", () => {
  it("extracts title, company, description from canonical JobPosting", () => {
    const json = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "Vice President, Information Technology",
      hiringOrganization: { "@type": "Organization", name: "Geron Corporation" },
      description: "<p>The VP of IT is accountable for oversight of IT...</p>",
    });
    const r = parseJobPostingJsonLd([json]);
    expect(r.title).toBe("Vice President, Information Technology");
    expect(r.company).toBe("Geron Corporation");
    expect(r.description).toBe("The VP of IT is accountable for oversight of IT...");
  });

  it("handles hiringOrganization as a bare string", () => {
    const json = JSON.stringify({
      "@type": "JobPosting",
      title: "Engineer",
      hiringOrganization: "Stripe",
    });
    expect(parseJobPostingJsonLd([json]).company).toBe("Stripe");
  });

  it("finds JobPosting inside @graph wrapper", () => {
    const json = JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebPage", name: "Careers" },
        {
          "@type": "JobPosting",
          title: "Director of Engineering",
          hiringOrganization: { name: "Perfecting Peds" },
        },
      ],
    });
    const r = parseJobPostingJsonLd([json]);
    expect(r.title).toBe("Director of Engineering");
    expect(r.company).toBe("Perfecting Peds");
  });

  it("handles @type as an array containing JobPosting", () => {
    const json = JSON.stringify({
      "@type": ["JobPosting", "Posting"],
      title: "PM",
      hiringOrganization: { name: "Acme" },
    });
    expect(parseJobPostingJsonLd([json]).title).toBe("PM");
  });

  it("strips HTML and collapses whitespace from description", () => {
    const json = JSON.stringify({
      "@type": "JobPosting",
      title: "Eng",
      description: "<div>Line one<br/><br/>Line&nbsp;two</div>\n\n  trailing",
    });
    expect(parseJobPostingJsonLd([json]).description).toBe("Line one Line two trailing");
  });

  it("returns empty when no JobPosting is present", () => {
    const json = JSON.stringify({ "@type": "WebPage", name: "About" });
    expect(parseJobPostingJsonLd([json])).toEqual({});
  });

  it("skips malformed JSON without throwing", () => {
    const good = JSON.stringify({
      "@type": "JobPosting",
      title: "Eng",
      hiringOrganization: { name: "Acme" },
    });
    const r = parseJobPostingJsonLd(["not-json{", good]);
    expect(r.title).toBe("Eng");
    expect(r.company).toBe("Acme");
  });

  it("returns empty for empty input", () => {
    expect(parseJobPostingJsonLd([])).toEqual({});
    expect(parseJobPostingJsonLd([""])).toEqual({});
  });

  it("trims whitespace from string fields", () => {
    const json = JSON.stringify({
      "@type": "JobPosting",
      title: "  CTO  ",
      hiringOrganization: { name: "  Stripe  " },
    });
    const r = parseJobPostingJsonLd([json]);
    expect(r.title).toBe("CTO");
    expect(r.company).toBe("Stripe");
  });
});
