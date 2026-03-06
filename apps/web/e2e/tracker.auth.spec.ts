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

  test("add application dialog opens with mode tabs", async ({ page }) => {
    await page.goto("/dashboard/tracker");
    await expect(
      page.getByRole("heading", { name: "Application Tracker" })
    ).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "Add Application" }).click();

    // Mode tabs should be visible
    await expect(page.getByRole("button", { name: "From URL" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Bulk Import" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Paste JD" })).toBeVisible();
  });

  test("URL mode shows fetch button and form fields", async ({ page }) => {
    await page.goto("/dashboard/tracker");
    await expect(
      page.getByRole("heading", { name: "Application Tracker" })
    ).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "Add Application" }).click();

    // URL mode is the default — should show URL input and Fetch button
    await expect(page.getByPlaceholder("https://...")).toBeVisible();
    await expect(page.getByRole("button", { name: "Fetch" })).toBeVisible();

    // Manual fields visible below divider
    await expect(page.getByPlaceholder("Company name")).toBeVisible();
    await expect(page.getByPlaceholder("Job title")).toBeVisible();
    await expect(
      page.getByPlaceholder("LinkedIn, Indeed, etc.")
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: "Add", exact: true })
    ).toBeVisible();
  });

  test("Fetch button is disabled without URL", async ({ page }) => {
    await page.goto("/dashboard/tracker");
    await expect(
      page.getByRole("heading", { name: "Application Tracker" })
    ).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "Add Application" }).click();

    const fetchBtn = page.getByRole("button", { name: "Fetch" });
    await expect(fetchBtn).toBeDisabled();

    // Type a URL — fetch should become enabled
    await page.getByPlaceholder("https://...").fill("https://example.com");
    await expect(fetchBtn).toBeEnabled();
  });

  test("switching to Bulk Import mode shows textarea", async ({ page }) => {
    await page.goto("/dashboard/tracker");
    await expect(
      page.getByRole("heading", { name: "Application Tracker" })
    ).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "Add Application" }).click();
    await page.getByRole("button", { name: "Bulk Import" }).click();

    // Should show textarea for URLs
    await expect(
      page.getByPlaceholder(/https:\/\/linkedin\.com/)
    ).toBeVisible();

    // Should show import button
    await expect(
      page.getByRole("button", { name: /Import \d+ URLs/ })
    ).toBeVisible();

    // URL mode fields should not be visible
    await expect(page.getByPlaceholder("https://...")).not.toBeVisible();
  });

  test("switching to Paste JD mode shows description textarea", async ({ page }) => {
    await page.goto("/dashboard/tracker");
    await expect(
      page.getByRole("heading", { name: "Application Tracker" })
    ).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "Add Application" }).click();
    await page.getByRole("button", { name: "Paste JD" }).click();

    // Should show company, role, source inputs
    await expect(page.getByPlaceholder("Company name")).toBeVisible();
    await expect(page.getByPlaceholder("Job title")).toBeVisible();

    // Should show job description textarea
    await expect(
      page.getByPlaceholder("Paste the full job description here...")
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: "Add", exact: true })
    ).toBeVisible();
  });

  test("Paste JD mode shows character count when text entered", async ({ page }) => {
    await page.goto("/dashboard/tracker");
    await expect(
      page.getByRole("heading", { name: "Application Tracker" })
    ).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "Add Application" }).click();
    await page.getByRole("button", { name: "Paste JD" }).click();

    const textarea = page.getByPlaceholder("Paste the full job description here...");
    await textarea.fill("This is a test job description with some content.");
    await expect(page.getByText("49 characters")).toBeVisible();
  });

  test("dialog resets when closed and reopened", async ({ page }) => {
    await page.goto("/dashboard/tracker");
    await expect(
      page.getByRole("heading", { name: "Application Tracker" })
    ).toBeVisible({ timeout: 15000 });

    // Open, switch to Paste JD, fill fields
    await page.getByRole("button", { name: "Add Application" }).click();
    await page.getByRole("button", { name: "Paste JD" }).click();
    await page.getByPlaceholder("Company name").fill("TestCo");

    // Close dialog
    await page.keyboard.press("Escape");

    // Reopen — should be back to URL mode with empty fields
    await page.getByRole("button", { name: "Add Application" }).click();
    await expect(page.getByPlaceholder("https://...")).toBeVisible();
    await expect(page.getByPlaceholder("Company name")).toHaveValue("");
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
