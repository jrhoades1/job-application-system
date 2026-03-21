/**
 * Unit tests for the nightly pipeline helper logic.
 *
 * These cover the pure, exported functions from the route — frequency
 * decisions and HTML escaping — which are the most testable units in the
 * pipeline without needing full Supabase / Resend mocks.
 */

import { describe, it, expect } from "vitest";
import { shouldSkipDigest, escapeHtml } from "../src/app/api/cron/nightly-pipeline/utils";

// ---------------------------------------------------------------------------
// shouldSkipDigest
// ---------------------------------------------------------------------------

describe("shouldSkipDigest", () => {
  const MONDAY = 1;
  const TUESDAY = 2;
  const SUNDAY = 0;
  const SATURDAY = 6;

  it("always skips when frequency is 'off'", () => {
    const result = shouldSkipDigest("off", MONDAY);
    expect(result.skip).toBe(true);
    expect(result.reason).toBe("digest_off");
  });

  it("skips 'off' regardless of day", () => {
    for (const day of [SUNDAY, MONDAY, TUESDAY, SATURDAY]) {
      const result = shouldSkipDigest("off", day);
      expect(result.skip).toBe(true);
    }
  });

  it("does NOT skip on weekly frequency when today is Monday", () => {
    const result = shouldSkipDigest("weekly", MONDAY);
    expect(result.skip).toBe(false);
    expect(result.reason).toBeUndefined();
  });

  it("skips on weekly frequency when today is not Monday", () => {
    for (const day of [TUESDAY, SUNDAY, SATURDAY, 3, 4, 5]) {
      const result = shouldSkipDigest("weekly", day);
      expect(result.skip).toBe(true);
      expect(result.reason).toBe("weekly_not_monday");
    }
  });

  it("never skips on daily frequency regardless of day", () => {
    for (const day of [SUNDAY, MONDAY, TUESDAY, SATURDAY]) {
      const result = shouldSkipDigest("daily", day);
      expect(result.skip).toBe(false);
    }
  });

  it("treats unknown frequency like daily (never skips)", () => {
    const result = shouldSkipDigest("unknown_value", TUESDAY);
    expect(result.skip).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// escapeHtml — prevents XSS in digest email templates
// ---------------------------------------------------------------------------

describe("escapeHtml", () => {
  it("passes through plain text unchanged", () => {
    expect(escapeHtml("Acme Corp")).toBe("Acme Corp");
  });

  it("escapes angle brackets", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;"
    );
  });

  it("escapes ampersands", () => {
    expect(escapeHtml("AT&T")).toBe("AT&amp;T");
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('He said "hello"')).toBe("He said &quot;hello&quot;");
  });

  it("handles multiple special characters in one string", () => {
    const input = '<b>Bold & "quoted"</b>';
    const output = escapeHtml(input);
    expect(output).toBe("&lt;b&gt;Bold &amp; &quot;quoted&quot;&lt;/b&gt;");
  });

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });
});
