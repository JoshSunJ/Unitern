import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: "**/public-beta.spec.ts",
  testIgnore: [],
  webServer: {
    ...(base.webServer as Exclude<typeof base.webServer, unknown[]>),
    command: "npm run dev",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: false,
    env: {
      ...(Array.isArray(base.webServer) ? {} : base.webServer?.env),
      UNITERN_LAUNCH_MODE: "public_beta",
      EMAIL_PROVIDER: "disabled",
    },
  },
});
