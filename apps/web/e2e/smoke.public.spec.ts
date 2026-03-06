import { test, expect } from "@playwright/test";

test.describe("Landing page", () => {
  test("loads without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Job Application Assistant" })
    ).toBeVisible({ timeout: 15000 });

    expect(errors).toEqual([]);
  });

  test("CTA buttons are visible", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("link", { name: "Get Started" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Sign In" })
    ).toBeVisible();
  });

  test("Get Started links to sign-up", async ({ page }) => {
    await page.goto("/");

    const cta = page.getByRole("link", { name: "Get Started" });
    await expect(cta).toHaveAttribute("href", /sign-up/);
  });

  test("Sign In links to sign-in", async ({ page }) => {
    await page.goto("/");

    const signIn = page.getByRole("link", { name: "Sign In" });
    await expect(signIn).toHaveAttribute("href", /sign-in/);
  });
});

test.describe("Auth protection", () => {
  test("dashboard is not accessible without auth", async ({ page }) => {
    const response = await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");

    // Clerk middleware either redirects to sign-in or returns an error
    const url = page.url();
    const status = response?.status() ?? 0;
    const isRedirected = !url.includes("/dashboard");
    const isBlocked = status === 401 || status === 403 || status === 404;

    expect(isRedirected || isBlocked).toBe(true);
  });
});
