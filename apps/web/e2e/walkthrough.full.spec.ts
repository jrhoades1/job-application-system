import { test, expect, type Page } from "@playwright/test";
import { skipWithoutAuth, refreshClerkSession } from "./helpers";

/**
 * Full application lifecycle walkthrough:
 *   1. Add an application via Paste JD
 *   2. Find it in the Evaluating tab
 *   3. Navigate to the detail page
 *   4. Score the application
 *   5. Tailor a resume (mocked AI)
 *   6. Generate a cover letter (mocked AI)
 *   7. Update status to Applied
 *   8. Clean up — delete the test application
 */

const TEST_COMPANY = `E2E_TestCo_${Date.now()}`;
const TEST_ROLE = "Staff Software Engineer";
const TEST_JD = `About the Role
We are looking for a Staff Software Engineer to lead our platform team.

Requirements:
- 8+ years of software engineering experience
- Strong experience with TypeScript, React, and Node.js
- Experience designing distributed systems
- Excellent communication and mentoring skills
- Experience with CI/CD pipelines and infrastructure as code

Preferred:
- Experience with Kubernetes and cloud platforms (AWS/GCP)
- Familiarity with observability tools (Datadog, Grafana)
- Prior experience in a leadership or tech lead role

Responsibilities:
- Design and implement scalable platform services
- Mentor junior engineers and conduct code reviews
- Collaborate with product and design on technical strategy
- Improve developer experience and internal tooling`;

test.beforeEach(async ({ page }) => {
  skipWithoutAuth();
  await refreshClerkSession(page);
});

test.describe("Application lifecycle walkthrough", () => {
  test("full flow: add → score → tailor resume → cover letter → update status → delete", async ({
    page,
  }) => {
    // This is a long workflow — give it plenty of time
    test.setTimeout(120000);

    // -------------------------------------------------------
    // Mock AI endpoints to avoid real API calls and costs
    // Scoring uses the local algorithmic engine (no mock needed)
    // -------------------------------------------------------
    await page.route("**/api/tailor-resume", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            resume: `# ${TEST_COMPANY} — Tailored Resume\n\n## Summary\nExperienced Staff Engineer with 10+ years building scalable platforms.\n\n## Experience\n- Led platform team of 8 engineers\n- Designed distributed systems handling 1M+ requests/day\n- TypeScript, React, Node.js, Kubernetes\n\n## Skills\nTypeScript, React, Node.js, AWS, Kubernetes, CI/CD`,
            match_percentage: 78,
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route("**/api/generate-cover-letter", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            cover_letter: `Dear Hiring Manager,\n\nI am writing to express my interest in the Staff Software Engineer position at ${TEST_COMPANY}.\n\nWith over 10 years of experience in software engineering, I bring deep expertise in TypeScript, React, and distributed systems. In my current role, I lead a platform team of 8 engineers and have designed systems handling over 1 million requests per day.\n\nI am particularly excited about the opportunity to improve developer experience and mentor junior engineers at ${TEST_COMPANY}.\n\nThank you for your consideration.\n\nBest regards`,
          }),
        });
      } else {
        await route.continue();
      }
    });

    // -------------------------------------------------------
    // Step 1: Add application via Paste JD
    // -------------------------------------------------------
    await page.goto("/dashboard/jobs");
    await expect(
      page.getByRole("heading", { name: "Jobs" })
    ).toBeVisible({ timeout: 15000 });

    // Open the Add Application dialog
    await page.getByRole("button", { name: "Add Application" }).click();
    await expect(
      page.getByRole("heading", { name: "New Application" })
    ).toBeVisible({ timeout: 5000 });

    // Switch to Paste JD mode
    await page.getByText("Paste JD").click();

    // Fill in company and role
    const dialog = page.locator("[role='dialog']");
    const companyInputs = dialog.getByPlaceholder("Company name");
    const roleInputs = dialog.getByPlaceholder("Job title");
    await companyInputs.fill(TEST_COMPANY);
    await roleInputs.fill(TEST_ROLE);

    // Fill in source
    await dialog.getByPlaceholder("LinkedIn, Indeed, etc.").fill("E2E Test");

    // Paste the job description
    await dialog
      .getByPlaceholder("Paste the full job description here...")
      .fill(TEST_JD);

    // Verify character count shows
    await expect(dialog.getByText("characters")).toBeVisible();

    // Submit the form
    await dialog.getByRole("button", { name: "Add" }).click();

    // Wait for the success toast
    await expect(page.getByText("Application added")).toBeVisible({
      timeout: 10000,
    });

    // Dialog should close
    await expect(dialog).not.toBeVisible({ timeout: 5000 });

    // -------------------------------------------------------
    // Step 2: Find it in the Evaluating tab
    // -------------------------------------------------------
    await page.getByRole("tab", { name: "Evaluating" }).click();

    // Wait for loading to finish and find our test application in the table
    await expect(page.getByText(TEST_COMPANY)).toBeVisible({ timeout: 15000 });
    // Scope to the table row to avoid matching other rows with the same role title
    await expect(
      page.getByRole("row").filter({ hasText: TEST_COMPANY }).getByText(TEST_ROLE)
    ).toBeVisible();

    // -------------------------------------------------------
    // Step 3: Navigate to the detail page
    // -------------------------------------------------------
    await page.getByRole("link", { name: TEST_COMPANY }).click();

    // Should land on the tracker detail page
    await expect(page).toHaveURL(/\/dashboard\/tracker\//, { timeout: 10000 });

    // Verify the detail page shows correct company and role
    await expect(
      page.getByRole("heading", { name: TEST_COMPANY })
    ).toBeVisible({ timeout: 10000 });
    // Use exact match to avoid also matching the role name inside the JD text
    await expect(page.getByText(TEST_ROLE, { exact: true })).toBeVisible();

    // Verify the job description is displayed
    await expect(
      page.getByText("About the Role")
    ).toBeVisible();

    // -------------------------------------------------------
    // Step 4: Score the application
    // -------------------------------------------------------
    const scoreBtn = page.getByRole("button", { name: "Score" });
    await expect(scoreBtn).toBeVisible();
    await expect(scoreBtn).toBeEnabled();
    await scoreBtn.click();

    // Wait for scoring to complete — button changes to "Scoring..." then back
    await expect(
      page.getByRole("button", { name: "Scoring..." })
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByText(/Scored:/)
    ).toBeVisible({ timeout: 30000 });

    // After scoring, the button should say "Re-Score"
    await expect(
      page.getByRole("button", { name: "Re-Score" })
    ).toBeVisible({ timeout: 5000 });

    // A score badge should now be visible in the header
    await expect(
      page.locator("text=Strong").or(page.locator("text=Good")).or(page.locator("text=Stretch")).or(page.locator("text=Long Shot"))
    ).toBeVisible({ timeout: 5000 });

    // -------------------------------------------------------
    // Step 5: Tailor resume (mocked)
    // -------------------------------------------------------
    const tailorBtn = page.getByRole("button", { name: "Tailor Resume" });
    await expect(tailorBtn).toBeVisible();
    await tailorBtn.click();

    // Wait for the mock response
    await expect(
      page.getByRole("button", { name: "Tailoring..." })
    ).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Resume tailored")).toBeVisible({
      timeout: 15000,
    });

    // The tailored resume should now be visible on the page
    await expect(page.getByText("Tailored Resume")).toBeVisible({
      timeout: 5000,
    });
    await expect(
      page.getByText("Experienced Staff Engineer")
    ).toBeVisible();

    // Download buttons should appear
    await expect(page.getByRole("button", { name: ".docx" })).toBeVisible();
    await expect(page.getByRole("button", { name: ".pdf" })).toBeVisible();
    await expect(page.getByRole("button", { name: ".md" })).toBeVisible();

    // -------------------------------------------------------
    // Step 6: Generate cover letter (mocked)
    // -------------------------------------------------------
    const clBtn = page.getByRole("button", {
      name: "Generate Cover Letter",
    });
    await expect(clBtn).toBeVisible();
    await clBtn.click();

    await expect(
      page.getByRole("button", { name: "Generating..." })
    ).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Cover letter generated")).toBeVisible({
      timeout: 15000,
    });

    // The cover letter content should be visible
    await expect(page.getByText("Cover Letter")).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByText("Dear Hiring Manager")
    ).toBeVisible();

    // -------------------------------------------------------
    // Step 7: Update status to Applied and save
    // -------------------------------------------------------
    // Find the status select in the Details card
    const detailsCard = page.locator("text=Details").locator("..").locator("..");
    const statusSelect = detailsCard.locator("[role='combobox']").first();
    await statusSelect.click();

    // Select "Applied"
    await page.getByRole("option", { name: "Applied" }).click();

    // Add a note
    const notesArea = detailsCard.getByRole("textbox").last();
    await notesArea.fill("E2E test application — automated walkthrough");

    // Save changes
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.getByText("Application updated")).toBeVisible({
      timeout: 10000,
    });

    // Verify the status badge updated
    await expect(page.getByText("Applied").first()).toBeVisible();

    // -------------------------------------------------------
    // Step 8: Clean up — delete the test application
    // -------------------------------------------------------
    // Handle the confirmation dialog
    page.on("dialog", (dialog) => dialog.accept());

    await page.getByRole("button", { name: "Delete Application" }).click();
    await expect(page.getByText("Application deleted")).toBeVisible({
      timeout: 10000,
    });

    // Should redirect back to jobs page
    await expect(page).toHaveURL(/\/dashboard\/jobs/, { timeout: 10000 });
  });
});

test.describe("Application detail page interactions", () => {
  test("navigating from Evaluating table to detail and back", async ({
    page,
  }) => {
    test.setTimeout(60000);

    await page.goto("/dashboard/jobs?tab=evaluating");
    await expect(
      page.getByRole("heading", { name: "Jobs" })
    ).toBeVisible({ timeout: 15000 });

    // Wait for content to load
    const hasApps = await page
      .locator("table")
      .isVisible({ timeout: 10000 })
      .catch(() => false);

    if (!hasApps) {
      // No applications in evaluating — skip the rest
      test.skip(true, "No applications in Evaluating tab to test navigation");
      return;
    }

    // Click the first company link in the table
    const firstLink = page.locator("table a").first();
    const companyName = await firstLink.textContent();
    await firstLink.click();

    // Should navigate to tracker detail
    await expect(page).toHaveURL(/\/dashboard\/tracker\//, { timeout: 10000 });

    // Detail page should show the company name
    if (companyName) {
      await expect(
        page.getByRole("heading", { name: companyName })
      ).toBeVisible({ timeout: 10000 });
    }

    // Verify key sections exist
    await expect(page.getByText("Details")).toBeVisible();
    await expect(page.getByText("Interviews")).toBeVisible();
    await expect(page.getByText("Documents")).toBeVisible();

    // Navigate back using browser
    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard\/jobs/, { timeout: 10000 });
  });

  test("scoring an existing application shows score badge", async ({
    page,
  }) => {
    test.setTimeout(60000);

    await page.goto("/dashboard/jobs?tab=evaluating");
    await expect(
      page.getByRole("heading", { name: "Jobs" })
    ).toBeVisible({ timeout: 15000 });

    const hasApps = await page
      .locator("table")
      .isVisible({ timeout: 10000 })
      .catch(() => false);

    if (!hasApps) {
      test.skip(true, "No applications to test scoring");
      return;
    }

    // Navigate to the first app
    await page.locator("table a").first().click();
    await expect(page).toHaveURL(/\/dashboard\/tracker\//, { timeout: 10000 });

    // Check if JD exists (scoring requires it)
    const hasJD = await page
      .getByText("Job Description")
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (!hasJD) {
      test.skip(true, "Application has no job description — cannot score");
      return;
    }

    // Click Score or Re-Score
    const scoreButton = page
      .getByRole("button", { name: "Score" })
      .or(page.getByRole("button", { name: "Re-Score" }));
    await expect(scoreButton).toBeVisible();
    await scoreButton.click();

    // Wait for scoring toast
    await expect(page.getByText(/Scored:/)).toBeVisible({ timeout: 30000 });
  });

  test("interview timeline — add and remove round", async ({ page }) => {
    test.setTimeout(60000);

    await page.goto("/dashboard/jobs?tab=evaluating");
    await expect(
      page.getByRole("heading", { name: "Jobs" })
    ).toBeVisible({ timeout: 15000 });

    const hasApps = await page
      .locator("table")
      .isVisible({ timeout: 10000 })
      .catch(() => false);

    if (!hasApps) {
      test.skip(true, "No applications to test interview timeline");
      return;
    }

    await page.locator("table a").first().click();
    await expect(page).toHaveURL(/\/dashboard\/tracker\//, { timeout: 10000 });

    // Find the Interviews section
    await expect(page.getByText("Interviews")).toBeVisible({ timeout: 10000 });

    // Click "+ Add Round"
    await page.getByRole("button", { name: "+ Add Round" }).click();

    // A new round should appear with R1 label
    await expect(page.getByText(/^R\d+$/)).toBeVisible({ timeout: 5000 });

    // Should show the expanded form with fields
    await expect(page.getByText("Interviewer(s)")).toBeVisible();
    await expect(page.getByText("Duration")).toBeVisible();

    // Fill in interviewer
    await page.getByPlaceholder("Name, Title").fill("Jane Doe, VP Eng");

    // Remove the round
    await page.getByRole("button", { name: "Remove Round" }).click();

    // Round should be gone — "No interview rounds tracked yet." or just the add button
    await expect(
      page.getByText("No interview rounds tracked yet.").or(
        page.getByRole("button", { name: "+ Add Round" })
      )
    ).toBeVisible();
  });
});
