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

  test("add dialog URL mode with fetch and form fields", async ({ page }) => {
    await page.goto("/dashboard/tracker");
    await expect(
      page.getByRole("heading", { name: "Application Tracker" })
    ).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "Add Application" }).click();

    // Mode tabs visible
    await expect(page.getByText("From URL")).toBeVisible();
    await expect(page.getByText("Bulk Import")).toBeVisible();
    await expect(page.getByText("Paste JD")).toBeVisible();

    // URL mode is default — check fields
    await expect(page.getByPlaceholder("https://...")).toBeVisible();
    await expect(page.getByRole("button", { name: "Fetch" })).toBeVisible();
    await expect(page.getByPlaceholder("Company name")).toBeVisible();
    await expect(page.getByPlaceholder("Job title")).toBeVisible();
    await expect(page.getByPlaceholder("LinkedIn, Indeed, etc.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add", exact: true })).toBeVisible();

    // Fetch button disabled when URL empty, enabled when filled
    const fetchBtn = page.getByRole("button", { name: "Fetch" });
    await expect(fetchBtn).toBeDisabled();
    await page.getByPlaceholder("https://...").fill("https://example.com");
    await expect(fetchBtn).toBeEnabled();
  });

  test("Bulk Import and Paste JD modes", async ({ page }) => {
    await page.goto("/dashboard/tracker");
    await expect(
      page.getByRole("heading", { name: "Application Tracker" })
    ).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "Add Application" }).click();

    // Switch to Bulk Import
    await page.getByText("Bulk Import").click();
    const bulkTextarea = page.locator("textarea");
    await expect(bulkTextarea).toBeVisible();

    // Switch to Paste JD
    await page.getByText("Paste JD").click();
    await expect(page.getByPlaceholder("Company name")).toBeVisible();
    await expect(page.getByPlaceholder("Paste the full job description here...")).toBeVisible();

    // Switch back to URL — verify reset
    await page.getByText("From URL").click();
    await expect(page.getByPlaceholder("https://...")).toBeVisible();
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
