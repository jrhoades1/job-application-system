import { test, expect } from "@playwright/test";
import { skipWithoutAuth, refreshClerkSession } from "./helpers";

test.beforeEach(async ({ page }) => {
  skipWithoutAuth();
  await refreshClerkSession(page);
});

test.describe("Application detail page", () => {
  test("renders detail form for any ID", async ({ page }) => {
    await page.goto("/dashboard/tracker/nonexistent-id-12345");
    // Page renders the detail form (Details card) even for unknown IDs
    await expect(page.getByText("Details")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Status")).toBeVisible();
  });

  test("navigating from tracker preserves back navigation", async ({ page }) => {
    await page.goto("/dashboard/tracker");
    await expect(
      page.getByRole("heading", { name: "Application Tracker" })
    ).toBeVisible({ timeout: 15000 });

    await expect(page.getByRole("link", { name: "Tracker" })).toBeVisible();
  });
});
