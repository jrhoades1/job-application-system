import { test, expect } from "@playwright/test";
import { skipWithoutAuth, refreshClerkSession } from "./helpers";

test.beforeEach(async ({ page }) => {
  skipWithoutAuth();
  await refreshClerkSession(page);
});

test.describe("Today page (dashboard index)", () => {
  test("renders heading and date", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Today" })
    ).toBeVisible({ timeout: 15000 });

    // Should show current day name (e.g., "Wednesday, March 12")
    const days = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const today = new Date();
    const dayName = days[today.getDay()];
    await expect(page.getByText(dayName, { exact: false })).toBeVisible();
  });

  test("shows stats bar with correct labels", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Today" })
    ).toBeVisible({ timeout: 15000 });

    // Compact stats bar at bottom
    await expect(page.getByText("Total")).toBeVisible();
    await expect(page.getByText("Active")).toBeVisible();
    await expect(page.getByText("Interviewing")).toBeVisible();
    await expect(page.getByText("Offers")).toBeVisible();
  });

  test("shows empty state or action sections", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Today" })
    ).toBeVisible({ timeout: 15000 });

    const hasActions =
      (await page.getByText("Urgent").count()) > 0 ||
      (await page.getByText("Do Today").count()) > 0 ||
      (await page.getByText("This Week").count()) > 0;
    const hasCaughtUp =
      (await page.getByText("all caught up").count()) > 0;

    expect(hasActions || hasCaughtUp).toBeTruthy();
  });

  test("stats bar links to Jobs page", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Today" })
    ).toBeVisible({ timeout: 15000 });

    // Total stat should link to jobs
    const totalLink = page
      .getByRole("link")
      .filter({ hasText: "Total" });
    await expect(totalLink).toHaveAttribute("href", /\/dashboard\/jobs/);

    // Interviewing stat should link to jobs filtered
    const interviewingLink = page
      .getByRole("link")
      .filter({ hasText: "Interviewing" });
    await expect(interviewingLink).toHaveAttribute(
      "href",
      /\/dashboard\/jobs\?tab=interviewing/
    );
  });

  test("action cards are clickable links", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Today" })
    ).toBeVisible({ timeout: 15000 });

    const actionButtons = page.getByRole("button", {
      name: /Prepare|Follow up|Debrief|Review leads|Set follow-up|Apply|Review|Check status/,
    });
    const count = await actionButtons.count();
    if (count > 0) {
      const firstAction = actionButtons.first();
      const parentLink = firstAction.locator("xpath=ancestor::a");
      await expect(parentLink).toHaveAttribute("href", /\/dashboard\//);
    }
  });
});
