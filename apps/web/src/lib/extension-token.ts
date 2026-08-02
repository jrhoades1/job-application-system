import { createHash, randomBytes } from "crypto";

/**
 * Extension API token primitives.
 *
 * A token is `jaa_` + 43 base64url chars (32 random bytes). Only the SHA-256
 * hash is persisted; the plaintext is returned once at generation time.
 *
 * These helpers are pure so they can be unit tested without a DB or a request.
 */

export const TOKEN_PREFIX = "jaa_";

/** 32 random bytes -> 43 base64url chars (no padding). */
const SECRET_BYTES = 32;
const SECRET_CHARS = 43;

/** Max simultaneously active tokens per user (one per browser/device, plus slack). */
export const MAX_ACTIVE_TOKENS = 5;

const TOKEN_SHAPE = new RegExp(`^${TOKEN_PREFIX}[A-Za-z0-9_-]{${SECRET_CHARS}}$`);

/** Generate a new plaintext token. Caller must persist only `hashExtensionToken(token)`. */
export function generateExtensionToken(): string {
  return TOKEN_PREFIX + randomBytes(SECRET_BYTES).toString("base64url");
}

/**
 * SHA-256 hex of the full plaintext token.
 *
 * A fast hash is correct here: the input is 256 bits of CSPRNG output, so
 * there is nothing to brute force. Hashing exists so a leaked DB dump does not
 * hand over working credentials.
 */
export function hashExtensionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Cheap structural check before touching the DB. Also rejects the retired
 * `jaa_<clerk_user_id>` format, which was never a secret.
 */
export function isExtensionTokenShape(token: string): boolean {
  return TOKEN_SHAPE.test(token);
}

/** Non-secret display fragment, e.g. `jaa_A1b2c3…` — stored for token identification. */
export function extensionTokenPrefix(token: string): string {
  return token.slice(0, TOKEN_PREFIX.length + 6);
}
