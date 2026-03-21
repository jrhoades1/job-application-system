/**
 * E2E tests for the Bullseye Profile form (Settings → Bullseye tab).
 *
 * Covers:
 *   - Form renders with all expected controls
 *   - Threshold slider responds to change
 *   - Target roles input accepts text
 *   - Digest frequency select accepts a change
 *   - Digest email input accepts a value
 *   - Save button triggers PUT /api/profile and shows success toast
 */

import { test, expect } from "@playwright/test";
import { skipWithoutAuth, refreshClerkSession } from "./helpers";

test.beforeEach(async ({ page }) => {
  skipWithoutAuth();
  await refreshClerkSession(page);
});

test.describe("Bullseye profile form", () => {
  test("renders all form sections on the Bullseye tab", async ({ page }) => {
    test.setTimeout(30000);

    await page.goto("/dashboard/settings?tab=bullseye");
    await expect(
      page.getByRole("heading", { name: "Settings" })
    ).toBeVisible({ timeout: 15000 });

    // Tab should be active
    const bullseyeTab = page.getByRole("tab", { name: "Bullseye" });
    await expect(bullseyeTab).toBeVisible();

    // Wait for form to load (not the loading placeholder)
    await expect(
      page.getByText("Match Threshold")
    ).toBeVisible({ timeout: 10000 });

    // All four cards should be visible
    await expect(page.getByText("Match Threshold")).toBeVisible();
    await expect(page.getByText("Target Roles")).toBeVisible();
    await expect(page.getByText("Compensation & Location")).toBeVisible();
    await expect(page.getByText("Morning Digest")).toBeVisible();

    // Save button
    await expect(
      page.getByRole("button", { name: "Save Bullseye Profile" })
    ).toBeVisible();
  });

  test("threshold slider is interactive", async ({ page }) => {
    test.setTimeout(30000);

    await page.goto("/dashboard/settings?tab=bullseye");
    await expect(page.getByText("Match Threshold")).toBeVisible({ timeout: 15000 });

    const slider = page.locator('input[type="range"]');
    await expect(slider).toBeVisible();

    // Change the slider value
    await slider.fill("70");
    await expect(slider).toHaveValue("70");

    // The percentage label should update
    await expect(page.locator("span.font-mono")).toContainText("70%");
  });

  test("target roles input accepts comma-separated values", async ({ page }) => {
    test.setTimeout(30000);

    await page.goto("/dashboard/settings?tab=bullseye");
    await expect(page.getByText("Target Roles")).toBeVisible({ timeout: 15000 });

    const rolesInput = page.getByPlaceholder(
      "Director of Engineering, VP of Product, Head of Platform..."
    );
    await expect(rolesInput).toBeVisible();
    await rolesInput.fill("VP of Engineering, Director of Platform");
    await expect(rolesInput).toHaveValue("VP of Engineering, Director of Platform");
  });

  test("digest frequency select accepts new value", async ({ page }) => {
    test.setTimeout(30000);

    await page.goto("/dashboard/settings?tab=bullseye");
    await expect(page.getByText("Morning Digest")).toBeVisible({ timeout: 15000 });

    const frequencySelect = page.locator("select").filter({ has: page.getByText("Daily") }).or(
      page.locator("select").nth(1)
    );

    // Select "weekly"
    await frequencySelect.selectOption("weekly");
    await expect(frequencySelect).toHaveValue("weekly");

    // Switch to "off"
    await frequencySelect.selectOption("off");
    await expect(frequencySelect).toHaveValue("off");
  });

  test("digest email input accepts an email address", async ({ page }) => {
    test.setTimeout(30000);

    await page.goto("/dashboard/settings?tab=bullseye");
    await expect(page.getByText("Morning Digest")).toBeVisible({ timeout: 15000 });

    const emailInput = page.getByPlaceholder(
      "you@example.com (leave blank to use in-app only)"
    );
    await expect(emailInput).toBeVisible();
    await emailInput.fill("test@example.com");
    await expect(emailInput).toHaveValue("test@example.com");
  });

  test("Save button calls PUT /api/profile and shows success toast", async ({ page }) => {
    test.setTimeout(30000);

    // Mock the profile API to avoid real DB writes
    await page.route("**/api/profile", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            clerk_user_id: "test-user",
            preferences: {
              score_threshold: 55,
              target_roles: [],
              digest_frequency: "daily",
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
        });
      } else if (route.request().method() === "PUT") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/dashboard/settings?tab=bullseye");
    await expect(page.getByText("Match Threshold")).toBeVisible({ timeout: 15000 });

    // Interact with the form
    await page.locator('input[type="range"]').fill("65");

    // Click Save
    await page.getByRole("button", { name: "Save Bullseye Profile" }).click();

    // Toast should appear
    await expect(
      page.getByText("Bullseye profile saved")
    ).toBeVisible({ timeout: 10000 });
  });
});
