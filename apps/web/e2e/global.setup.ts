import { clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";
import path from "path";

const authFile = path.join(__dirname, "../playwright/.clerk/user.json");

const hasClerkCreds =
  !!process.env.CLERK_SECRET_KEY &&
  !!process.env.E2E_CLERK_USER_USERNAME &&
  !!process.env.E2E_CLERK_USER_PASSWORD;

setup.describe.configure({ mode: "serial" });

setup("obtain clerk testing token", async () => {
  if (!hasClerkCreds) {
    console.log(
      "Skipping Clerk setup — missing CLERK_SECRET_KEY, E2E_CLERK_USER_USERNAME, or E2E_CLERK_USER_PASSWORD"
    );
    return;
  }
  await clerkSetup();
});

setup("authenticate test user", async ({ page }) => {
  setup.setTimeout(60000);

  if (!hasClerkCreds) {
    console.log("Skipping auth — no Clerk credentials configured");
    return;
  }

  const secretKey = process.env.CLERK_SECRET_KEY!;
  const email = process.env.E2E_CLERK_USER_USERNAME!;

  // Find the test user by email
  const usersRes = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${secretKey}` } }
  );
  const users = await usersRes.json();
  if (!users.length)
    throw new Error(`No Clerk user found with email: ${email}`);
  const userId = users[0].id;

  // Create a sign-in token with redirect back to our app
  const tokenRes = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: userId,
      expires_in_seconds: 600,
    }),
  });
  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Failed to create sign-in token: ${err}`);
  }
  const tokenData = await tokenRes.json();

  // Use the testing token to enable Clerk dev mode in the browser
  await setupClerkTestingToken({ page });

  // Visit the ticket URL — Clerk authenticates and sets session
  // Pass the ticket as a query parameter — Clerk consumes it and creates a session
  await page.goto(`/sign-in?__clerk_ticket=${tokenData.token}`);
  // Wait for Clerk to process the ticket and redirect
  await page.waitForTimeout(5000);
  // Navigate to a protected page to verify auth works
  await page.goto("/dashboard");
  await page.waitForURL("**/dashboard**", { timeout: 30000 });

  await page.context().storageState({ path: authFile });
});
