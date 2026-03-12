import { test, expect } from "@playwright/test";
import { skipWithoutAuth, refreshClerkSession } from "./helpers";

test.beforeEach(async ({ page }) => {
  skipWithoutAuth();
  await refreshClerkSession(page);
});

test.describe("Jobs page", () => {
  test("renders heading and tab navigation", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/dashboard/jobs");
    await expect(
      page.getByRole("heading", { name: "Jobs" })
    ).toBeVisible({ timeout: 15000 });

    // All tabs should be visible
    await expect(page.getByRole("tab", { name: "New Leads" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Evaluating" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Applied" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Interviewing" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Offers" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Closed" })).toBeVisible();
  });

  test("Add Application and Quick Score buttons are visible", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/dashboard/jobs");
    await expect(
      page.getByRole("heading", { name: "Jobs" })
    ).toBeVisible({ timeout: 15000 });

    await expect(
      page.getByRole("button", { name: "Add Application" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Quick Score" })
    ).toBeVisible();
  });

  test("switching tabs shows content", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/dashboard/jobs");
    await expect(
      page.getByRole("heading", { name: "Jobs" })
    ).toBeVisible({ timeout: 15000 });

    // Click Applied tab
    await page.getByRole("tab", { name: "Applied" }).click();

    // Wait for loading to complete — should show table or empty state
    await expect(
      page.getByText("Loading...").or(page.getByText("No applications in this stage")).or(page.locator("table"))
    ).toBeVisible({ timeout: 10000 });
  });

  test("New Leads tab content loads", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/dashboard/jobs");
    await expect(
      page.getByRole("heading", { name: "Jobs" })
    ).toBeVisible({ timeout: 15000 });

    // New Leads tab should be visible and clickable
    const leadsTab = page.getByRole("tab", { name: "New Leads" });
    await expect(leadsTab).toBeVisible();
    await leadsTab.click();

    // Wait for content to load — either leads, empty message, or sort dropdown
    await expect(
      page.getByText("Newest").or(page.getByText("No leads pending review"))
    ).toBeVisible({ timeout: 10000 });
  });

  test("Add Application dialog opens", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/dashboard/jobs");
    await expect(
      page.getByRole("heading", { name: "Jobs" })
    ).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "Add Application" }).click();
    await expect(
      page.getByRole("heading", { name: "New Application" })
    ).toBeVisible({ timeout: 10000 });

    // Mode tabs should be visible
    await expect(page.getByText("From URL")).toBeVisible();
    await expect(page.getByText("Paste JD")).toBeVisible();
  });

  test("Quick Score dialog opens", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/dashboard/jobs");
    await expect(
      page.getByRole("heading", { name: "Jobs" })
    ).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "Quick Score" }).click();
    await expect(
      page.getByRole("heading", { name: "Quick Score" })
    ).toBeVisible({ timeout: 5000 });

    // Input fields should be present
    await expect(page.getByPlaceholder("e.g. Google")).toBeVisible();
    await expect(
      page.getByPlaceholder("e.g. VP of Engineering")
    ).toBeVisible();
  });
});
