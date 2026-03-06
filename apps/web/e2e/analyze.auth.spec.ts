import { test, expect } from "@playwright/test";
import { skipWithoutAuth, refreshClerkSession } from "./helpers";

test.beforeEach(async ({ page }) => {
  skipWithoutAuth();
  await refreshClerkSession(page);
});

test.describe("Analyze Job page", () => {
  test("renders form with all inputs", async ({ page }) => {
    await page.goto("/dashboard/analyze");
    await page.getByRole("heading", { name: "Analyze Job" }).waitFor({ timeout: 15000 });

    await expect(
      page.getByRole("heading", { name: "Analyze Job" })
    ).toBeVisible();

    // Form inputs
    await expect(page.getByPlaceholder("e.g. Google")).toBeVisible();
    await expect(page.getByPlaceholder("e.g. VP of Engineering")).toBeVisible();
    await expect(
      page.getByPlaceholder("Paste the full job description here...")
    ).toBeVisible();

    // Analyze button
    await expect(
      page.getByRole("button", { name: "Analyze Job" })
    ).toBeVisible();
  });

  test("form inputs accept text", async ({ page }) => {
    await page.goto("/dashboard/analyze");
    await page.getByRole("heading", { name: "Analyze Job" }).waitFor({ timeout: 15000 });

    const company = page.getByPlaceholder("e.g. Google");
    const role = page.getByPlaceholder("e.g. VP of Engineering");
    const description = page.getByPlaceholder(
      "Paste the full job description here..."
    );

    await company.fill("Test Company");
    await role.fill("Software Engineer");
    await description.fill("This is a test job description.");

    await expect(company).toHaveValue("Test Company");
    await expect(role).toHaveValue("Software Engineer");
    await expect(description).toHaveValue("This is a test job description.");
  });

  test("analyze button is present and enabled", async ({ page }) => {
    await page.goto("/dashboard/analyze");
    await page.getByRole("heading", { name: "Analyze Job" }).waitFor({ timeout: 15000 });

    const analyzeBtn = page.getByRole("button", { name: "Analyze Job" });
    await expect(analyzeBtn).toBeVisible();
    await expect(analyzeBtn).toBeEnabled();
  });
});
