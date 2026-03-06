import { test, expect } from "@playwright/test";
import { skipWithoutAuth, refreshClerkSession } from "./helpers";

test.beforeEach(async ({ page }) => {
  skipWithoutAuth();
  await refreshClerkSession(page);
});

test.describe("Dashboard page", () => {
  test("renders heading and stat cards", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible({ timeout: 15000 });

    // Stat cards should be visible
    await expect(page.getByText("Total Applications")).toBeVisible();
    await expect(page.getByText("Active")).toBeVisible();
    await expect(page.getByText("Interviews")).toBeVisible();
    await expect(page.getByText("Offers")).toBeVisible();
  });

  test("recent activity section renders", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible({ timeout: 15000 });

    await expect(page.getByText("Recent Activity")).toBeVisible();
  });

  test("stat cards link to tracker with correct filters", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible({ timeout: 15000 });

    // Total Applications card should link to tracker
    const totalCard = page
      .getByRole("link")
      .filter({ hasText: "Total Applications" });
    await expect(totalCard).toHaveAttribute("href", "/dashboard/tracker");
  });
});
