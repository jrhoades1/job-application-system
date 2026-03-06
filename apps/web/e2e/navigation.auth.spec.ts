import { test, expect } from "@playwright/test";
import { skipWithoutAuth, refreshClerkSession } from "./helpers";

test.beforeEach(async ({ page }) => {
  skipWithoutAuth();
  await refreshClerkSession(page);
});

test.describe("Sidebar navigation", () => {
  test("all nav items are visible", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/dashboard");
    await page.getByRole("heading", { name: "Dashboard" }).waitFor({ timeout: 30000 });

    const navItems = [
      { name: "Dashboard", href: "/dashboard" },
      { name: "Profile", href: "/dashboard/profile" },
      { name: "Analyze Job", href: "/dashboard/analyze" },
      { name: "Tracker", href: "/dashboard/tracker" },
      { name: "Pipeline", href: "/dashboard/pipeline" },
      { name: "Insights", href: "/dashboard/insights" },
      { name: "Cost Admin", href: "/dashboard/admin" },
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
    await page.getByRole("heading", { name: "Dashboard" }).waitFor({ timeout: 15000 });

    await expect(page.getByText("Job App Assistant")).toBeVisible();
    await expect(page.getByText("AI-powered job search")).toBeVisible();
  });

  test("clicking nav items routes correctly", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/dashboard");
    await page.getByRole("heading", { name: "Dashboard" }).waitFor({ timeout: 30000 });

    // Navigate to Tracker
    await page.getByRole("link", { name: "Tracker" }).click();
    await expect(page.getByRole("heading", { name: "Application Tracker" })).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/\/dashboard\/tracker/);

    // Navigate to Analyze Job
    await page.getByRole("link", { name: "Analyze Job" }).click();
    await expect(page.getByRole("heading", { name: "Analyze Job" })).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/\/dashboard\/analyze/);

    // Navigate back to Dashboard
    await page.getByRole("link", { name: "Dashboard" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
