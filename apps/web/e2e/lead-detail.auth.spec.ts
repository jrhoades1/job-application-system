import { test, expect } from "@playwright/test";
import { skipWithoutAuth, refreshClerkSession } from "./helpers";

test.beforeEach(async ({ page }) => {
  skipWithoutAuth();
  await refreshClerkSession(page);
});

test.describe("Lead detail sheet", () => {
  test("clicking a lead card opens the detail sheet", async ({ page }) => {
    test.setTimeout(60000);

    // Mock the pipeline leads API with a test lead
    await page.route("**/api/pipeline/leads**", async (route) => {
      const url = new URL(route.request().url());
      if (route.request().method() === "GET") {
        if (url.searchParams.get("count_only") === "true") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([{ id: "test-lead-1" }]),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([
              {
                id: "test-lead-1",
                clerk_user_id: "test-user",
                company: "Acme Corp",
                role: "Senior Software Engineer",
                source_platform: "LinkedIn",
                career_page_url: "https://acme.com/careers/123",
                description_text:
                  "We are looking for a Senior Software Engineer to join our team.\n\nRequirements:\n- 5+ years of experience\n- Strong TypeScript skills\n- Experience with React and Node.js",
                score_overall: "good",
                score_match_percentage: 72,
                score_details: {
                  hard_requirements: 3,
                  matched: 2,
                  partial: 1,
                  gaps: 0,
                },
                status: "pending_review",
                skip_reason: null,
                location: "Remote",
                red_flags: ["Requires clearance"],
                rank: 1,
                email_date: "2026-03-12",
                created_at: "2026-03-12T10:00:00Z",
              },
            ]),
          });
        }
      } else {
        await route.continue();
      }
    });

    await page.goto("/dashboard/jobs");
    await expect(
      page.getByRole("heading", { name: "Jobs" })
    ).toBeVisible({ timeout: 15000 });

    // Ensure we're on the New Leads tab
    await page.getByRole("tab", { name: "New Leads" }).click();

    // Wait for the lead card to appear
    await expect(page.getByText("Acme Corp")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Senior Software Engineer")).toBeVisible();

    // Click the lead card (not the action buttons)
    await page.getByText("Acme Corp").click();

    // Sheet should open with full details
    const sheet = page.locator("[data-slot='sheet-content']");
    await expect(sheet).toBeVisible({ timeout: 5000 });

    // Verify company and role in sheet header
    await expect(sheet.getByText("Acme Corp")).toBeVisible();
    await expect(sheet.getByText("Senior Software Engineer")).toBeVisible();

    // Verify score badge
    await expect(sheet.getByText("Good 72%")).toBeVisible();

    // Verify metadata
    await expect(sheet.getByText("LinkedIn")).toBeVisible();
    await expect(sheet.getByText("Remote")).toBeVisible();

    // Verify career page link
    await expect(sheet.getByText("View Original Posting")).toBeVisible();

    // Verify red flags
    await expect(sheet.getByText("Requires clearance")).toBeVisible();

    // Verify score breakdown section
    await expect(sheet.getByText("Score Breakdown")).toBeVisible();

    // Verify job description
    await expect(sheet.getByText("Job Description")).toBeVisible();
    await expect(
      sheet.getByText("We are looking for a Senior Software Engineer")
    ).toBeVisible();

    // Verify action buttons in the sheet
    await expect(sheet.getByRole("button", { name: "Promote" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Skip" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Rescore" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Reparse" })).toBeVisible();
  });

  test("sheet closes when clicking outside or pressing close", async ({
    page,
  }) => {
    test.setTimeout(60000);

    // Mock a single lead
    await page.route("**/api/pipeline/leads**", async (route) => {
      if (route.request().method() === "GET") {
        const url = new URL(route.request().url());
        if (url.searchParams.get("count_only") === "true") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([{ id: "test-lead-1" }]),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([
              {
                id: "test-lead-1",
                clerk_user_id: "test-user",
                company: "TestCo",
                role: "Engineer",
                source_platform: "Indeed",
                career_page_url: null,
                description_text: "A test job description.",
                score_overall: "stretch",
                score_match_percentage: 45,
                score_details: null,
                status: "pending_review",
                skip_reason: null,
                location: null,
                red_flags: [],
                rank: 1,
                email_date: null,
                created_at: "2026-03-12T10:00:00Z",
              },
            ]),
          });
        }
      } else {
        await route.continue();
      }
    });

    await page.goto("/dashboard/jobs");
    await expect(
      page.getByRole("heading", { name: "Jobs" })
    ).toBeVisible({ timeout: 15000 });

    await page.getByRole("tab", { name: "New Leads" }).click();
    await expect(page.getByText("TestCo")).toBeVisible({ timeout: 10000 });

    // Open the sheet
    await page.getByText("TestCo").click();
    const sheet = page.locator("[data-slot='sheet-content']");
    await expect(sheet).toBeVisible({ timeout: 5000 });

    // Close via the X button
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(sheet).not.toBeVisible({ timeout: 5000 });
  });

  test("lead card action buttons don't open the detail sheet", async ({
    page,
  }) => {
    test.setTimeout(60000);

    // Mock lead with rescore button visible (score_match_percentage = 0)
    await page.route("**/api/pipeline/leads**", async (route) => {
      if (route.request().method() === "GET") {
        const url = new URL(route.request().url());
        if (url.searchParams.get("count_only") === "true") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([{ id: "test-lead-1" }]),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([
              {
                id: "test-lead-1",
                clerk_user_id: "test-user",
                company: "ButtonTestCo",
                role: "Developer",
                source_platform: null,
                career_page_url: null,
                description_text: "Test JD",
                score_overall: null,
                score_match_percentage: null,
                score_details: null,
                status: "pending_review",
                skip_reason: null,
                location: null,
                red_flags: [],
                rank: 1,
                email_date: null,
                created_at: "2026-03-12T10:00:00Z",
              },
            ]),
          });
        }
      } else {
        await route.continue();
      }
    });

    // Mock the rescore endpoint
    await page.route("**/api/pipeline/rescore", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          rescored: true,
          score: { overall: "good", match_percentage: 65 },
        }),
      });
    });

    await page.goto("/dashboard/jobs");
    await expect(
      page.getByRole("heading", { name: "Jobs" })
    ).toBeVisible({ timeout: 15000 });

    await page.getByRole("tab", { name: "New Leads" }).click();
    await expect(page.getByText("ButtonTestCo")).toBeVisible({
      timeout: 10000,
    });

    // Click the Score button — should NOT open sheet
    await page.getByRole("button", { name: "Score" }).click();

    // Give a moment for sheet to potentially appear
    await page.waitForTimeout(500);

    // Sheet should not be visible
    const sheet = page.locator("[data-slot='sheet-content']");
    await expect(sheet).not.toBeVisible();
  });

  test("shows empty description message when no JD available", async ({
    page,
  }) => {
    test.setTimeout(60000);

    await page.route("**/api/pipeline/leads**", async (route) => {
      if (route.request().method() === "GET") {
        const url = new URL(route.request().url());
        if (url.searchParams.get("count_only") === "true") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([{ id: "test-lead-1" }]),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([
              {
                id: "test-lead-1",
                clerk_user_id: "test-user",
                company: "NoJDCo",
                role: "Manager",
                source_platform: null,
                career_page_url: null,
                description_text: null,
                score_overall: "good",
                score_match_percentage: 55,
                score_details: null,
                status: "pending_review",
                skip_reason: null,
                location: null,
                red_flags: [],
                rank: 1,
                email_date: null,
                created_at: "2026-03-12T10:00:00Z",
              },
            ]),
          });
        }
      } else {
        await route.continue();
      }
    });

    await page.goto("/dashboard/jobs");
    await expect(
      page.getByRole("heading", { name: "Jobs" })
    ).toBeVisible({ timeout: 15000 });

    await page.getByRole("tab", { name: "New Leads" }).click();
    await expect(page.getByText("NoJDCo")).toBeVisible({ timeout: 10000 });

    await page.getByText("NoJDCo").click();
    const sheet = page.locator("[data-slot='sheet-content']");
    await expect(sheet).toBeVisible({ timeout: 5000 });

    await expect(
      sheet.getByText("No job description available")
    ).toBeVisible();
  });
});
