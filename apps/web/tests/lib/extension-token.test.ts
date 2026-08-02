import { describe, it, expect } from "vitest";
import {
  MAX_ACTIVE_TOKENS,
  TOKEN_PREFIX,
  extensionTokenPrefix,
  generateExtensionToken,
  hashExtensionToken,
  isExtensionTokenShape,
} from "@/lib/extension-token";

describe("generateExtensionToken", () => {
  it("produces jaa_ + 43 base64url chars", () => {
    const token = generateExtensionToken();
    expect(token.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(token).toHaveLength(TOKEN_PREFIX.length + 43);
    expect(isExtensionTokenShape(token)).toBe(true);
  });

  it("never repeats", () => {
    const tokens = new Set(Array.from({ length: 500 }, generateExtensionToken));
    expect(tokens.size).toBe(500);
  });
});

describe("isExtensionTokenShape", () => {
  it("rejects the retired jaa_<clerk_user_id> format", () => {
    // This is exactly what the old scheme handed out — it must never validate.
    expect(isExtensionTokenShape("jaa_user_2abcDEFghiJKLmnoPQRstuVWxyz")).toBe(false);
  });

  it("rejects a bare clerk user id", () => {
    expect(isExtensionTokenShape("user_2abcDEFghiJKLmnoPQRstuVWxyz")).toBe(false);
  });

  it("rejects an empty token and a bare prefix", () => {
    expect(isExtensionTokenShape("")).toBe(false);
    expect(isExtensionTokenShape(TOKEN_PREFIX)).toBe(false);
  });

  it("rejects wrong length", () => {
    const token = generateExtensionToken();
    expect(isExtensionTokenShape(token.slice(0, -1))).toBe(false);
    expect(isExtensionTokenShape(token + "a")).toBe(false);
  });

  it("rejects non-base64url characters", () => {
    const token = generateExtensionToken();
    expect(isExtensionTokenShape(token.slice(0, -1) + "!")).toBe(false);
  });

  it("rejects leading or trailing whitespace", () => {
    const token = generateExtensionToken();
    expect(isExtensionTokenShape(` ${token}`)).toBe(false);
    expect(isExtensionTokenShape(`${token}\n`)).toBe(false);
  });
});

describe("hashExtensionToken", () => {
  it("returns 64 hex chars matching the DB CHECK constraint", () => {
    expect(hashExtensionToken(generateExtensionToken())).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    const token = generateExtensionToken();
    expect(hashExtensionToken(token)).toBe(hashExtensionToken(token));
  });

  it("differs for different tokens", () => {
    expect(hashExtensionToken(generateExtensionToken())).not.toBe(
      hashExtensionToken(generateExtensionToken())
    );
  });

  it("does not contain the plaintext", () => {
    const token = generateExtensionToken();
    expect(hashExtensionToken(token)).not.toContain(token.slice(TOKEN_PREFIX.length));
  });
});

describe("extensionTokenPrefix", () => {
  it("keeps the prefix plus 6 chars and drops the rest of the secret", () => {
    const token = generateExtensionToken();
    const prefix = extensionTokenPrefix(token);
    expect(prefix).toHaveLength(TOKEN_PREFIX.length + 6);
    expect(token.startsWith(prefix)).toBe(true);
    expect(isExtensionTokenShape(prefix)).toBe(false);
  });
});

describe("MAX_ACTIVE_TOKENS", () => {
  it("is a small positive cap", () => {
    expect(MAX_ACTIVE_TOKENS).toBeGreaterThan(0);
    expect(MAX_ACTIVE_TOKENS).toBeLessThanOrEqual(10);
  });
});
