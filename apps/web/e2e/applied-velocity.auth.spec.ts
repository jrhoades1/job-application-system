import { test, expect } from "@playwright/test";
import { skipWithoutAuth, refreshClerkSession } from "./helpers";

test.beforeEach(async ({ page }) => {
  skipWithoutAuth();
  await refreshClerkSession(page);
});

test.describe("Applied velocity card", () => {
  test("renders on /dashboard and responds to window toggle", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/dashboard");

    const toggle = page.getByTestId("velocity-window-toggle");
    await expect(toggle).toBeVisible({ timeout: 15000 });

    // Default should be Week
    const weekTab = toggle.getByRole("tab", { name: "Week" });
    await expect(weekTab).toHaveAttribute("aria-selected", "true");

    const count = page.getByTestId("velocity-count");
    await expect(count).toBeVisible();
    const weekValue = (await count.textContent())?.trim();

    // Switch to Today — value should refresh (and almost certainly be <= Week).
    const [velocityReq] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/applied-velocity?window=today") && r.ok()
      ),
      toggle.getByRole("tab", { name: "Today" }).click(),
    ]);
    expect(velocityReq.ok()).toBeTruthy();

    await expect(
      toggle.getByRole("tab", { name: "Today" })
    ).toHaveAttribute("aria-selected", "true");

    // Count rerenders — just assert it's still numeric (not "…" loading).
    await expect(count).not.toHaveText("…", { timeout: 10000 });

    // Switch back to Week and confirm we reach a stable numeric count.
    await toggle.getByRole("tab", { name: "Week" }).click();
    await expect(count).not.toHaveText("…", { timeout: 10000 });
    const weekValueAfter = (await count.textContent())?.trim();
    expect(weekValueAfter).toBe(weekValue);
  });

  test("also renders on /dashboard/insights", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/dashboard/insights");
    await expect(
      page.getByTestId("velocity-window-toggle")
    ).toBeVisible({ timeout: 15000 });
  });
});
