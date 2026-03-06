import { describe, it, expect } from "vitest";
import * as cheerio from "cheerio";
import {
  extractFromJsonLd,
  extractWithSelectors,
  extractDescription,
  inferSourceFromUrl,
  isPrivateUrl,
  TITLE_SELECTORS,
  COMPANY_SELECTORS,
  JD_SELECTORS,
} from "@/lib/scrape-helpers";

describe("inferSourceFromUrl", () => {
  it("detects LinkedIn", () => {
    expect(inferSourceFromUrl("https://www.linkedin.com/jobs/view/123")).toBe("LinkedIn");
  });

  it("detects Indeed", () => {
    expect(inferSourceFromUrl("https://www.indeed.com/viewjob?jk=abc")).toBe("Indeed");
  });

  it("detects Greenhouse", () => {
    expect(inferSourceFromUrl("https://boards.greenhouse.io/company/jobs/123")).toBe("Greenhouse");
  });

  it("detects Lever", () => {
    expect(inferSourceFromUrl("https://jobs.lever.co/company/abc-123")).toBe("Lever");
  });

  it("detects Workday", () => {
    expect(inferSourceFromUrl("https://company.wd5.myworkdayjobs.com/careers/job/123")).toBe("Workday");
  });

  it("detects Glassdoor", () => {
    expect(inferSourceFromUrl("https://www.glassdoor.com/job-listing/abc")).toBe("Glassdoor");
  });

  it("detects ZipRecruiter", () => {
    expect(inferSourceFromUrl("https://www.ziprecruiter.com/jobs/abc")).toBe("ZipRecruiter");
  });

  it("detects Dice", () => {
    expect(inferSourceFromUrl("https://www.dice.com/job-detail/abc")).toBe("Dice");
  });

  it("detects Wellfound (formerly AngelList)", () => {
    expect(inferSourceFromUrl("https://wellfound.com/company/acme/jobs")).toBe("Wellfound");
    expect(inferSourceFromUrl("https://angel.co/company/acme/jobs")).toBe("Wellfound");
  });

  it("detects Built In", () => {
    expect(inferSourceFromUrl("https://builtin.com/job/abc")).toBe("Built In");
  });

  it("detects Swooped", () => {
    expect(inferSourceFromUrl("https://swooped.co/job/abc")).toBe("Swooped");
  });

  it("falls back to hostname for unknown sites", () => {
    expect(inferSourceFromUrl("https://careers.acme.com/jobs/123")).toBe("careers");
  });

  it("strips www prefix for unknown sites", () => {
    expect(inferSourceFromUrl("https://www.acme.com/jobs/123")).toBe("acme");
  });
});

describe("isPrivateUrl", () => {
  it("blocks localhost", () => {
    expect(isPrivateUrl("http://localhost:3000/api")).toBe(true);
  });

  it("blocks 127.0.0.1", () => {
    expect(isPrivateUrl("http://127.0.0.1:8080/page")).toBe(true);
  });

  it("blocks 0.0.0.0", () => {
    expect(isPrivateUrl("http://0.0.0.0/page")).toBe(true);
  });

  it("blocks 10.x.x.x", () => {
    expect(isPrivateUrl("http://10.0.0.1/page")).toBe(true);
  });

  it("blocks 192.168.x.x", () => {
    expect(isPrivateUrl("http://192.168.1.1/page")).toBe(true);
  });

  it("blocks 172.x.x.x", () => {
    expect(isPrivateUrl("http://172.16.0.1/page")).toBe(true);
  });

  it("blocks IPv6 loopback", () => {
    expect(isPrivateUrl("http://[::1]/page")).toBe(true);
  });

  it("blocks file:// protocol", () => {
    expect(isPrivateUrl("file:///etc/passwd")).toBe(true);
  });

  it("allows public URLs", () => {
    expect(isPrivateUrl("https://www.linkedin.com/jobs/123")).toBe(false);
    expect(isPrivateUrl("https://boards.greenhouse.io/acme")).toBe(false);
  });

  it("returns true for invalid URLs", () => {
    expect(isPrivateUrl("not-a-url")).toBe(true);
  });
});

describe("extractFromJsonLd", () => {
  it("extracts job posting data from JSON-LD", () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {
          "@type": "JobPosting",
          "title": "Senior Engineer",
          "hiringOrganization": { "name": "Acme Corp" },
          "description": "We are looking for a senior engineer..."
        }
      </script>
    </head><body></body></html>`;

    const $ = cheerio.load(html);
    const result = extractFromJsonLd($);
    expect(result.title).toBe("Senior Engineer");
    expect(result.company).toBe("Acme Corp");
    expect(result.description).toBe("We are looking for a senior engineer...");
  });

  it("handles hiringOrganization as a string", () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {
          "@type": "JobPosting",
          "title": "Developer",
          "hiringOrganization": "SimpleCompany"
        }
      </script>
    </head><body></body></html>`;

    const $ = cheerio.load(html);
    const result = extractFromJsonLd($);
    expect(result.company).toBe("SimpleCompany");
  });

  it("ignores non-JobPosting JSON-LD", () => {
    const html = `<html><head>
      <script type="application/ld+json">
        { "@type": "WebPage", "name": "About Us" }
      </script>
    </head><body></body></html>`;

    const $ = cheerio.load(html);
    const result = extractFromJsonLd($);
    expect(result.title).toBeUndefined();
    expect(result.company).toBeUndefined();
  });

  it("handles malformed JSON gracefully", () => {
    const html = `<html><head>
      <script type="application/ld+json">{ broken json }</script>
    </head><body></body></html>`;

    const $ = cheerio.load(html);
    const result = extractFromJsonLd($);
    expect(result.title).toBeUndefined();
  });

  it("returns empty result when no JSON-LD present", () => {
    const $ = cheerio.load("<html><body>No scripts here</body></html>");
    const result = extractFromJsonLd($);
    expect(result).toEqual({});
  });
});

describe("extractWithSelectors", () => {
  it("extracts text from the first matching selector", () => {
    const html = `<html><body>
      <h1 class="job-title">Software Engineer</h1>
      <h2>Another heading</h2>
    </body></html>`;
    const $ = cheerio.load(html);
    expect(extractWithSelectors($, ['h1[class*="title"]', "h2"])).toBe("Software Engineer");
  });

  it("skips selectors with text shorter than 3 characters", () => {
    const html = `<html><body>
      <span class="company">Hi</span>
      <div class="employer">Acme Corporation</div>
    </body></html>`;
    const $ = cheerio.load(html);
    expect(extractWithSelectors($, ['[class*="company"]', '[class*="employer"]'])).toBe("Acme Corporation");
  });

  it("returns undefined when no selectors match", () => {
    const $ = cheerio.load("<html><body><p>Nothing here</p></body></html>");
    expect(extractWithSelectors($, [".nonexistent", "#missing"])).toBeUndefined();
  });

  it("works with TITLE_SELECTORS on LinkedIn-like markup", () => {
    const html = `<html><body>
      <h3 class="top-card-layout__title">VP of Engineering</h3>
    </body></html>`;
    const $ = cheerio.load(html);
    expect(extractWithSelectors($, TITLE_SELECTORS)).toBe("VP of Engineering");
  });

  it("works with COMPANY_SELECTORS on Indeed-like markup", () => {
    const html = `<html><body>
      <span data-testid="inlineHeader-companyName">TechCo Inc</span>
    </body></html>`;
    const $ = cheerio.load(html);
    expect(extractWithSelectors($, COMPANY_SELECTORS)).toBe("TechCo Inc");
  });
});

describe("extractDescription", () => {
  it("extracts long description text", () => {
    const longText = "We are looking for an experienced software engineer " +
      "who can lead our team and build scalable systems across multiple platforms.";
    const html = `<html><body>
      <div class="job-description">${longText}</div>
    </body></html>`;
    const $ = cheerio.load(html);
    const result = extractDescription($, JD_SELECTORS);
    expect(result).toBeTruthy();
    expect(result!.length).toBeGreaterThan(50);
  });

  it("skips elements with text shorter than 50 characters", () => {
    const html = `<html><body>
      <div class="job-description">Short text.</div>
      <article>This is a much longer job description that contains all the details about the role and responsibilities.</article>
    </body></html>`;
    const $ = cheerio.load(html);
    const result = extractDescription($, ['[class*="job-description"]', "article"]);
    expect(result).toContain("much longer job description");
  });

  it("returns undefined when no description found", () => {
    const $ = cheerio.load("<html><body><p>Tiny</p></body></html>");
    expect(extractDescription($, [".nonexistent"])).toBeUndefined();
  });

  it("works with Greenhouse-style markup", () => {
    const longContent = "About the role: We need someone with 5+ years of experience in " +
      "distributed systems, cloud infrastructure, and team leadership to join our growing team.";
    const html = `<html><body>
      <div id="content">${longContent}</div>
    </body></html>`;
    const $ = cheerio.load(html);
    const result = extractDescription($, JD_SELECTORS);
    expect(result).toBeTruthy();
    expect(result!).toContain("distributed systems");
  });
});

describe("end-to-end HTML parsing", () => {
  it("parses a full job page with JSON-LD + HTML elements", () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {
          "@type": "JobPosting",
          "title": "Director of Engineering",
          "hiringOrganization": { "name": "MegaCorp" },
          "description": "<p>Lead our engineering team of 50+ across 3 continents building next-gen cloud platform.</p>"
        }
      </script>
    </head><body>
      <h1 class="job-title">Director of Engineering</h1>
      <span class="company-name">MegaCorp</span>
      <div class="job-description">
        Lead our engineering team of 50+ across 3 continents building next-gen cloud platform.
      </div>
    </body></html>`;

    const $ = cheerio.load(html);

    // JSON-LD should take priority
    const jsonLd = extractFromJsonLd($);
    expect(jsonLd.title).toBe("Director of Engineering");
    expect(jsonLd.company).toBe("MegaCorp");
    expect(jsonLd.description).toContain("Lead our engineering team");

    // HTML selectors also work as fallback
    expect(extractWithSelectors($, TITLE_SELECTORS)).toBe("Director of Engineering");
    expect(extractWithSelectors($, COMPANY_SELECTORS)).toBe("MegaCorp");
  });

  it("falls back to HTML selectors when no JSON-LD present", () => {
    const html = `<html><body>
      <h1>Staff Software Engineer</h1>
      <div class="company-name">StartupXYZ</div>
      <div class="jobDescription">
        We're looking for a staff engineer to architect and build our core platform.
        You'll work with a team of 10 engineers on high-impact projects spanning
        microservices, data pipelines, and real-time systems.
      </div>
    </body></html>`;

    const $ = cheerio.load(html);
    const jsonLd = extractFromJsonLd($);

    expect(jsonLd.title).toBeUndefined();
    expect(extractWithSelectors($, TITLE_SELECTORS)).toBe("Staff Software Engineer");
    expect(extractWithSelectors($, COMPANY_SELECTORS)).toBe("StartupXYZ");
    expect(extractDescription($, JD_SELECTORS)).toBeTruthy();
  });
});
