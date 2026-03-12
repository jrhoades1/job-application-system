import { test, expect } from "@playwright/test";
import { skipWithoutAuth, refreshClerkSession } from "./helpers";

test.beforeEach(async ({ page }) => {
  skipWithoutAuth();
  await refreshClerkSession(page);
});

test.describe("Analyze redirect", () => {
  test("/dashboard/analyze redirects to /dashboard/jobs", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/dashboard/analyze");
    await expect(page).toHaveURL(/\/dashboard\/jobs/, { timeout: 10000 });
    await expect(
      page.getByRole("heading", { name: "Jobs" })
    ).toBeVisible({ timeout: 15000 });
  });
});
