import { expect, test } from "@playwright/test";

import { E2E_MARKETPLACE_OWNER_EMAIL, E2E_MARKETPLACE_PASSWORD } from "./test-account";

const operations = [
  ["POST", "/api/listings", 401],
  ["PATCH", "/api/listings/999999", 401],
  ["POST", "/api/reports", 401],
  ["POST", "/api/blocks", 401],
  ["DELETE", "/api/blocks", 401],
  ["PATCH", "/api/listings/999999/photos/999999", 401],
  ["PATCH", "/api/admin/reports/999999", 403],
] as const;

test("marketplace operations require sign-in before reading invalid input", async ({ request }) => {
  for (const [method, path, status] of operations) {
    const response = await request.fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      data: Buffer.from("{"),
    });
    expect.soft(response.status(), `${method} ${path}`).toBe(status);
  }
});

test("signed-in marketplace operations reject malformed and null JSON without server errors", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_MARKETPLACE_OWNER_EMAIL);
  await page.getByLabel("Password").fill(E2E_MARKETPLACE_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  for (const data of ["{", "null"]) {
    for (const [method, path] of operations) {
      const response = await page.request.fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        data: Buffer.from(data),
      });
      expect.soft(response.status(), `${method} ${path}, body=${data}`).toBe(400);
      if (response.status() === 400) expect((await response.json()).error).toEqual(expect.any(String));
    }
  }
});
