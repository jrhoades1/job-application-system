import { test, expect } from "@playwright/test";
import { skipWithoutAuth, refreshClerkSession } from "./helpers";

test.beforeEach(async ({ page }) => {
  skipWithoutAuth();
  await refreshClerkSession(page);
});

test.describe("Sidebar navigation", () => {
  test("all 4 nav items are visible", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Today" })
    ).toBeVisible({ timeout: 30000 });

    const navItems = [
      { name: "Today", href: "/dashboard" },
      { name: "Jobs", href: "/dashboard/jobs" },
      { name: "Insights", href: "/dashboard/insights" },
      { name: "Settings", href: "/dashboard/settings" },
    ];

    for (const item of navItems) {
      const link = page.getByRole("link", { name: item.name });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", item.href);
    }
  });

  test("sidebar shows app branding", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Today" })
    ).toBeVisible({ timeout: 15000 });

    await expect(page.getByText("Job App Assistant")).toBeVisible();
    await expect(page.getByText("AI-powered job search")).toBeVisible();
  });

  test("clicking nav items routes correctly", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Today" })
    ).toBeVisible({ timeout: 30000 });

    // Navigate to Jobs
    await page.getByRole("link", { name: "Jobs" }).click();
    await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/\/dashboard\/jobs/);

    // Navigate to Settings
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/\/dashboard\/settings/);

    // Navigate back to Today
    await page.getByRole("link", { name: "Today" }).click();
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("old routes redirect correctly", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Today" })
    ).toBeVisible({ timeout: 30000 });

    // /dashboard/pipeline → /dashboard/jobs?tab=leads
    await page.goto("/dashboard/pipeline");
    await expect(page).toHaveURL(/\/dashboard\/jobs\?tab=leads/, { timeout: 10000 });

    // /dashboard/analyze → /dashboard/jobs
    await page.goto("/dashboard/analyze");
    await expect(page).toHaveURL(/\/dashboard\/jobs/, { timeout: 10000 });

    // /dashboard/profile → /dashboard/settings?tab=profile
    await page.goto("/dashboard/profile");
    await expect(page).toHaveURL(/\/dashboard\/settings\?tab=profile/, { timeout: 10000 });

    // /dashboard/admin → /dashboard/settings?tab=costs
    await page.goto("/dashboard/admin");
    await expect(page).toHaveURL(/\/dashboard\/settings\?tab=costs/, { timeout: 10000 });
  });
});
