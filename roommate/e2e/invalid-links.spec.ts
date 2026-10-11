import { expect, test } from "@playwright/test";

for (const id of ["not-a-number", "1.5", "999999999999999999999999"]) {
  test(`invalid listing ID ${id} returns a missing-item response`, async ({ request }) => {
    const response = await request.get(`/api/listings/${id}`);
    expect(response.status()).toBe(404);
    expect((await response.json()).error).toEqual(expect.any(String));
  });
}

for (const path of ["/listings/not-a-number", "/requests/not-a-number"]) {
  test(`mistyped link ${path} shows a useful missing-page screen`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "That page moved out." })).toBeVisible();
  });
}
