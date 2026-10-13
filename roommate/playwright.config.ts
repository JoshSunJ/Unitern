import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      AUTH_URL: "http://localhost:3000",
      AUTH_SECRET: process.env.AUTH_SECRET || "e2e-only-secret-with-at-least-32-characters",
      EMAIL_PROVIDER: "preview",
      ROAD_ROUTING_PROVIDER: "disabled",
      AUTH_GOOGLE_ID: "unitern-browser-test.apps.googleusercontent.com",
      AUTH_GOOGLE_SECRET: "local-browser-test-only",
      GEMINI_API_KEY: "local-browser-test-only",
      ADMIN_EMAIL: "marketplace-owner@e2e.unitern.local",
      NEXT_PUBLIC_MAPTILER_KEY: "",
      NEXT_PUBLIC_MAP_STYLE_URL: "http://localhost:3000/test-map-style.json",
    },
  },
});
