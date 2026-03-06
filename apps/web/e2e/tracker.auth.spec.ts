import { test, expect } from "@playwright/test";
import { skipWithoutAuth, refreshClerkSession } from "./helpers";

test.beforeEach(async ({ page }) => {
  skipWithoutAuth();
  await refreshClerkSession(page);
});

test.describe("Tracker page", () => {
  test("renders heading and controls", async ({ page }) => {
    await page.goto("/dashboard/tracker");
    await expect(
      page.getByRole("heading", { name: "Application Tracker" })
    ).toBeVisible({ timeout: 15000 });

    await expect(
      page.getByRole("button", { name: "Add Application" })
    ).toBeVisible();

    await expect(
      page.getByPlaceholder("Search company or role...")
    ).toBeVisible();
  });

  test("add application dialog opens", async ({ page }) => {
    await page.goto("/dashboard/tracker");
    await expect(
      page.getByRole("heading", { name: "Application Tracker" })
    ).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "Add Application" }).click();

    await expect(page.getByPlaceholder("Company name")).toBeVisible();
    await expect(page.getByPlaceholder("Job title")).toBeVisible();
    await expect(
      page.getByPlaceholder("LinkedIn, Indeed, etc.")
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: "Add", exact: true })
    ).toBeVisible();
  });

  test("search input accepts text", async ({ page }) => {
    await page.goto("/dashboard/tracker");
    await expect(
      page.getByRole("heading", { name: "Application Tracker" })
    ).toBeVisible({ timeout: 15000 });

    const search = page.getByPlaceholder("Search company or role...");
    await search.fill("nonexistent-company-xyz");
    await expect(search).toHaveValue("nonexistent-company-xyz");
  });

  test("table headers are visible when data exists", async ({ page }) => {
    await page.goto("/dashboard/tracker");
    await expect(
      page.getByRole("heading", { name: "Application Tracker" })
    ).toBeVisible({ timeout: 15000 });

    const table = page.locator("table");
    if (await table.isVisible()) {
      await expect(page.getByText("Company").first()).toBeVisible();
      await expect(page.getByText("Role").first()).toBeVisible();
      await expect(page.getByText("Status").first()).toBeVisible();
    }
  });
});
