import { expect, test } from "@playwright/test";
import { encode } from "@auth/core/jwt";
import { Pool } from "pg";
import { E2E_AFFILIATION_EMAIL, E2E_AFFILIATION_INSTITUTION_EMAIL } from "./test-account";

test("public beta offers only Google login and explains unavailable email links", async ({ page, request }) => {
  await page.goto("/sign-in");
  await expect(page.getByLabel("Public beta")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
  const providers = await (await request.get("/api/auth/providers")).json();
  expect(Object.keys(providers)).toEqual(["google"]);
  for (const path of ["/sign-up", "/forgot-password", "/verify-email"]) {
    await page.goto(path);
    await expect(page.getByLabel("Public beta")).toBeVisible();
    await expect(page.getByRole("button", { name: /Send|Create account|Reset password/ })).toHaveCount(0);
  }
  for (const path of ["/api/auth/forgot-password", "/api/auth/resend-verification"]) {
    const response = await request.post(path, { data: { email: E2E_AFFILIATION_EMAIL } });
    expect(response.status()).toBe(503);
    expect(await response.json()).not.toHaveProperty("verificationPreviewUrl");
  }
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy at Unitern" })).toBeVisible();
});

test("a signed-in beta student requests manual review and cannot post before approval", async ({ page, context }) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const user = await pool.query<{ id: number; sessionVersion: number }>('SELECT "id", "sessionVersion" FROM "User" WHERE "email" = $1', [E2E_AFFILIATION_EMAIL]);
    expect(user.rows).toHaveLength(1);
    // A local encrypted Auth.js fixture tests the authenticated journey without
    // adding an application bypass or involving a real Google account.
    const session = await encode({
      token: { sub: String(user.rows[0].id), sessionVersion: user.rows[0].sessionVersion, email: E2E_AFFILIATION_EMAIL },
      secret: process.env.AUTH_SECRET || "e2e-only-secret-with-at-least-32-characters",
      salt: "authjs.session-token",
    });
    await context.addCookies([{ name: "authjs.session-token", value: session, url: "http://localhost:3000", httpOnly: true, sameSite: "Lax" }]);
    await page.goto("/verify");
    await page.getByRole("combobox", { name: "University" }).selectOption({ label: "San José State University" });
    await page.getByLabel("School or company email").fill(E2E_AFFILIATION_INSTITUTION_EMAIL);
    await page.getByRole("button", { name: "Request affiliation review" }).click();
    await expect(page.getByRole("heading", { name: "Review requested." })).toBeVisible();
    await expect(page.getByText(/email notifications are unavailable during the public beta/i)).toBeVisible();
    await page.reload();
    await expect(page.getByText("Administrator review pending")).toBeVisible();
    await page.goto("/listings/new");
    await expect(page.getByText("Verify your affiliation before posting a listing.")).toBeVisible();
    const state = await pool.query<{ status: string; verificationStatus: string; tokens: string }>(`SELECT v."status", u."verificationStatus", (SELECT COUNT(*) FROM "AffiliationVerificationToken" t WHERE t."verificationId" = v."id") AS tokens FROM "User" u JOIN "AffiliationVerification" v ON v."userId" = u."id" WHERE u."email" = $1 ORDER BY v."createdAt" DESC LIMIT 1`, [E2E_AFFILIATION_EMAIL]);
    expect(state.rows[0]).toEqual({ status: "pending_review", verificationStatus: "submitted", tokens: "0" });
  } finally { await pool.end(); }
});
