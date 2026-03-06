import { test, expect } from "@playwright/test";
import { skipWithoutAuth, refreshClerkSession } from "./helpers";

test.beforeEach(async ({ page }) => {
  skipWithoutAuth();
  await refreshClerkSession(page);
});

test.describe("Profile page", () => {
  test("renders heading and form sections", async ({ page }) => {
    await page.goto("/dashboard/profile");
    await page.getByRole("heading", { name: "Profile Setup" }).waitFor({ timeout: 15000 });

    await expect(page.getByText("Import from Resume")).toBeVisible();
    await expect(page.getByText("Personal Information")).toBeVisible();
    await expect(page.getByText("Career Narrative")).toBeVisible();
    await expect(page.getByText("Work History", { exact: true })).toBeVisible();
    await expect(page.getByText("Skills & Achievements")).toBeVisible();
  });

  test("personal information fields are present", async ({ page }) => {
    await page.goto("/dashboard/profile");
    await page.getByRole("heading", { name: "Profile Setup" }).waitFor({ timeout: 15000 });

    const emailInput = page.locator("input[type='email']");
    await expect(emailInput).toBeVisible();

    await expect(
      page.getByRole("button", { name: "Save Profile" })
    ).toBeVisible();
  });

  test("career narrative textarea is editable", async ({ page }) => {
    await page.goto("/dashboard/profile");
    await page.getByRole("heading", { name: "Profile Setup" }).waitFor({ timeout: 15000 });

    const textarea = page.getByPlaceholder(/career positioning/i);
    await expect(textarea).toBeVisible();

    await textarea.fill("Test career narrative for e2e testing.");
    await expect(textarea).toHaveValue(
      "Test career narrative for e2e testing."
    );
  });

  test("action buttons are present", async ({ page }) => {
    await page.goto("/dashboard/profile");
    await page.getByRole("heading", { name: "Profile Setup" }).waitFor({ timeout: 15000 });

    await expect(
      page.getByRole("button", { name: /Upload Resume/i })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Add Position/i })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Add Category/i })
    ).toBeVisible();
  });
});
