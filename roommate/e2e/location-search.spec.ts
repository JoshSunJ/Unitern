import { expect, test } from "@playwright/test";

test("map search clears stale suggestions and supports keyboard destination selection", async ({ page }) => {
  await page.route("**/api/location-search?*", async (route) => {
    const q = new URL(route.request().url()).searchParams.get("q");
    await route.fulfill({ json: { results: [{ id: q, shortLabel: q === "Adobe" ? "Adobe Headquarters" : "Google Campus", label: `${q}, San Jose, California`, type: "poi", coordinates: { latitude: 37.3309, longitude: -121.8931 } }] } });
  });
  await page.goto("/map");
  const input = page.getByRole("combobox", { name: "University or campus" });
  await input.fill("Adobe");
  await expect(page.getByRole("option", { name: /Adobe Headquarters/ })).toBeVisible();
  await input.fill("Google");
  await expect(page.getByRole("option", { name: /Adobe Headquarters/ })).toHaveCount(0);
  await expect(page.getByRole("option", { name: /Google Campus/ })).toBeVisible();
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(input).toHaveValue("Google, San Jose, California");
  await expect(page.getByRole("listbox")).toHaveCount(0);
});
