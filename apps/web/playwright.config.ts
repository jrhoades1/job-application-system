import { defineConfig } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, ".env.local") });

const PORT = Number(process.env.DEV_PORT) || 3002;

const hasClerkCreds =
  !!process.env.CLERK_SECRET_KEY &&
  !!process.env.E2E_CLERK_USER_USERNAME &&
  !!process.env.E2E_CLERK_USER_PASSWORD;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 4,
  retries: 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /global\.setup\.ts/,
    },
    {
      name: "public",
      testMatch: /.*\.public\.spec\.ts/,
      use: { browserName: "chromium" },
    },
    {
      name: "authenticated",
      testMatch: /.*\.auth\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        browserName: "chromium",
        storageState: hasClerkCreds
          ? "playwright/.clerk/user.json"
          : undefined,
      },
    },
    {
      name: "full",
      testMatch: /.*\.full\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        browserName: "chromium",
        storageState: hasClerkCreds
          ? "playwright/.clerk/user.json"
          : undefined,
      },
    },
  ],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60000,
  },
});
