import { test } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import type { Page } from "@playwright/test";

export const hasClerkCreds =
  !!process.env.CLERK_SECRET_KEY &&
  !!process.env.E2E_CLERK_USER_USERNAME &&
  !!process.env.E2E_CLERK_USER_PASSWORD;

/**
 * Skip the current test if Clerk credentials are not configured.
 * Use this in .auth.spec.ts files to gracefully degrade.
 */
export function skipWithoutAuth() {
  test.skip(
    !hasClerkCreds,
    "Skipped — add CLERK_SECRET_KEY, E2E_CLERK_USER_USERNAME, E2E_CLERK_USER_PASSWORD to .env.local"
  );
}

/**
 * Refresh Clerk testing token for the page to prevent session expiry mid-suite.
 */
export async function refreshClerkSession(page: Page) {
  if (hasClerkCreds) {
    await setupClerkTestingToken({ page });
  }
}
