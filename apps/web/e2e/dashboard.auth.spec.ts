import { test, expect } from "@playwright/test";
import { skipWithoutAuth, refreshClerkSession } from "./helpers";

test.beforeEach(async ({ page }) => {
  skipWithoutAuth();
  await refreshClerkSession(page);
});

test.describe("Dashboard (Today view)", () => {
  test("/dashboard shows Today page with stats", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Today" })
    ).toBeVisible({ timeout: 15000 });

    // Stats bar should be visible
    await expect(page.getByText("Total")).toBeVisible();
    await expect(page.getByText("Active")).toBeVisible();
    await expect(page.getByText("Offers")).toBeVisible();
  });

  test("/dashboard/today redirects to /dashboard", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/dashboard/today");
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 10000 });
    await expect(
      page.getByRole("heading", { name: "Today" })
    ).toBeVisible({ timeout: 15000 });
  });
});
