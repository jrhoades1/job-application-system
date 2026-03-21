import { test, expect } from "@playwright/test";
import { skipWithoutAuth, refreshClerkSession } from "./helpers";

test.beforeEach(async ({ page }) => {
  skipWithoutAuth();
  await refreshClerkSession(page);
});

test.describe("Settings page", () => {
  test("renders heading and tab navigation", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/dashboard/settings");
    await expect(
      page.getByRole("heading", { name: "Settings" })
    ).toBeVisible({ timeout: 15000 });

    // All tabs should be visible
    await expect(page.getByRole("tab", { name: "Profile" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Bullseye" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Gmail" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Extension" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Cost & Usage" })).toBeVisible();
  });

  test("Profile tab loads by default with form fields", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/dashboard/settings");
    await expect(
      page.getByRole("heading", { name: "Settings" })
    ).toBeVisible({ timeout: 15000 });

    // Profile tab should be active by default — look for Personal Information card
    await expect(
      page.getByText("Personal Information").or(page.getByText("Loading profile..."))
    ).toBeVisible({ timeout: 10000 });
  });

  test("Gmail tab shows email pipeline", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/dashboard/settings?tab=gmail");
    await expect(
      page.getByRole("heading", { name: "Settings" })
    ).toBeVisible({ timeout: 15000 });

    // Gmail tab content
    await expect(
      page.getByText("Email Pipeline")
    ).toBeVisible({ timeout: 10000 });

    // Should show either Connected or Not Connected badge
    await expect(
      page.getByText("Connected").or(page.getByText("Not Connected"))
    ).toBeVisible({ timeout: 10000 });
  });

  test("Cost & Usage tab shows spend data", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/dashboard/settings?tab=costs");
    await expect(
      page.getByRole("heading", { name: "Settings" })
    ).toBeVisible({ timeout: 15000 });

    // Cost tab content
    await expect(
      page.getByText("AI Spend This Month").or(page.getByText("Loading..."))
    ).toBeVisible({ timeout: 10000 });
  });

  test("switching tabs shows correct content", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/dashboard/settings");
    await expect(
      page.getByRole("heading", { name: "Settings" })
    ).toBeVisible({ timeout: 15000 });

    // Click Bullseye tab
    await page.getByRole("tab", { name: "Bullseye" }).click();
    await expect(
      page.getByText("Bullseye Profile").or(page.getByText("Match Threshold"))
    ).toBeVisible({ timeout: 10000 });

    // Click Gmail tab
    await page.getByRole("tab", { name: "Gmail" }).click();
    await expect(page.getByText("Email Pipeline")).toBeVisible({ timeout: 10000 });

    // Click Cost & Usage tab
    await page.getByRole("tab", { name: "Cost & Usage" }).click();
    await expect(
      page.getByText("AI Spend This Month").or(page.getByText("Loading..."))
    ).toBeVisible({ timeout: 10000 });

    // Click back to Profile tab
    await page.getByRole("tab", { name: "Profile" }).click();
    await expect(
      page.getByText("Personal Information").or(page.getByText("Loading profile..."))
    ).toBeVisible({ timeout: 10000 });
  });

  test("Bullseye tab loads the Bullseye form", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/dashboard/settings?tab=bullseye");
    await expect(
      page.getByRole("heading", { name: "Settings" })
    ).toBeVisible({ timeout: 15000 });

    // Bullseye tab should be active
    const bullseyeTab = page.getByRole("tab", { name: "Bullseye" });
    await expect(bullseyeTab).toHaveAttribute("data-state", "active", { timeout: 5000 });

    // Bullseye form should render (or be loading)
    await expect(
      page.getByText("Match Threshold").or(page.getByText("Loading..."))
    ).toBeVisible({ timeout: 10000 });
  });

  test("tab param in URL sets active tab", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/dashboard/settings?tab=costs");
    await expect(
      page.getByRole("heading", { name: "Settings" })
    ).toBeVisible({ timeout: 15000 });

    // Cost tab should be active
    const costsTab = page.getByRole("tab", { name: "Cost & Usage" });
    await expect(costsTab).toHaveAttribute("data-state", "active", { timeout: 5000 });
  });
});
