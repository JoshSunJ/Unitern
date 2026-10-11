import { expect, test } from "@playwright/test";
import { E2E_MARKETPLACE_OWNER_EMAIL, E2E_MARKETPLACE_PASSWORD } from "./test-account";

test("Google sign-in starts a protected OIDC flow from both account screens", async ({ page }) => {
  // Inspect initiation without signing into a real Google account.
  await page.route("https://accounts.google.com/**", (route) => route.fulfill({ contentType: "text/html", body: "Google authorization test destination" }));
  for (const path of ["/sign-in?next=/verify", "/sign-up?next=/verify"]) {
    await page.goto(path);
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect(page).toHaveURL(/^https:\/\/accounts\.google\.com\//);
    const url = new URL(page.url());
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/auth/callback/google");
    expect(url.searchParams.get("scope")?.split(" ").sort()).toEqual(["email", "openid", "profile"]);
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(url.searchParams.get("nonce")).toBeTruthy();
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
  }
});

test("password sign-in returns to the originally requested protected page", async ({ page }) => {
  await page.goto("/saved");
  await expect(page).toHaveURL(/\/sign-in\?next=/);
  await page.getByLabel("Email").fill(E2E_MARKETPLACE_OWNER_EMAIL);
  await page.getByLabel("Password").fill(E2E_MARKETPLACE_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/saved$/);
});
