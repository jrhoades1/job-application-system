import { test, expect } from "@playwright/test";
import { skipWithoutAuth, refreshClerkSession } from "./helpers";

test.beforeEach(async ({ page }) => {
  skipWithoutAuth();
  await refreshClerkSession(page);
});

test.describe("Pipeline redirect", () => {
  test("/dashboard/pipeline redirects to /dashboard/jobs?tab=leads", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/dashboard/pipeline");
    await expect(page).toHaveURL(/\/dashboard\/jobs\?tab=leads/, { timeout: 10000 });
    await expect(
      page.getByRole("heading", { name: "Jobs" })
    ).toBeVisible({ timeout: 15000 });
  });
});

test.describe("Insights page", () => {
  test("renders heading", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/dashboard/insights");
    await expect(
      page.getByRole("heading", { name: "Insights" })
    ).toBeVisible({ timeout: 15000 });
  });
});
