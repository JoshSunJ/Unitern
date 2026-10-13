import { expect, test } from "@playwright/test";
import { createCommuteE2EListings, removeCommuteE2EListings } from "./database";

test.beforeEach(async ({ page }) => {
  await page.route("**/test-map-style.json", (route) => route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#fffdf0" } }] } }));
});

test("homepage has an obvious cities-only selector and retains the chosen city on the area guide", async ({ page }) => {
  await page.goto("/");
  const selector = page.getByRole("combobox", { name: "Choose your city", exact: true });
  await expect(selector).toBeVisible();
  const box = await selector.boundingBox();
  expect(box!.y).toBeLessThan(750);
  await selector.selectOption("unitern.los-angeles");
  await expect(page.getByRole("heading", { name: "Homes around Los Angeles." })).toBeVisible();
  await page.goto("/map");
  await expect(page.getByRole("heading", { name: "Build a life around Los Angeles." })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "University or campus" })).toHaveValue(/UCLA/);
});

test("real campus shortcut API resolves UCLA and SJSU and switches to the correct city", async ({ page }) => {
  await page.goto("/map");
  const campus = page.getByRole("combobox", { name: "University or campus" });
  await campus.fill("UCLA");
  await expect(page.getByRole("option", { name: /University of California, Los Angeles/ })).toHaveCount(1);
  await campus.press("ArrowDown");
  await campus.press("Enter");
  await expect(page.getByRole("heading", { name: "Build a life around Los Angeles." })).toBeVisible();
  await campus.fill("sjsu");
  await expect(page.getByRole("option", { name: /San José State University/ })).toHaveCount(1);
  await campus.press("ArrowDown");
  await campus.press("Enter");
  await expect(page.getByRole("heading", { name: "Build a life around San Jose." })).toBeVisible();
});

test("street route times and the commute slider filter available homes without refetching routes", async ({ page }) => {
  const ids = await createCommuteE2EListings();
  let requests = 0;
  await page.route("**/api/commute/routes?*", async (route) => {
    requests++;
    const params = new URL(route.request().url()).searchParams;
    const origin = params.get("origin")!.split(",").map(Number);
    const minutes = origin[0] === -121.89 ? 8 : 48;
    await route.fulfill({ json: { routes: params.get("modes")!.split(",").map((mode) => ({ mode, distanceMiles: minutes / 10, durationMinutes: minutes, provider: "osrm", geometry: { type: "LineString", coordinates: [origin, [-121.8811, 37.3352]] } })) } });
  });
  try {
    await page.goto("/map");
    await page.getByRole("button", { name: "transit", exact: true }).click();
    await page.getByRole("slider", { name: /Maximum commute/ }).press("Home");
    const matches = page.getByRole("region", { name: "Homes matching your commute" });
    await expect(matches.getByRole("button", { name: /E2E commute nearby.*8 min.*street route/ })).toBeVisible();
    await expect(matches.getByRole("button", { name: /E2E commute farther/ })).toHaveCount(0);
    await page.getByRole("combobox", { name: "Home to compare", exact: true }).selectOption(String(ids[1]));
    await expect(page.getByText("48 min", { exact: true })).toBeVisible();
    const before = requests;
    await page.getByRole("slider", { name: /Maximum commute/ }).press("End");
    await expect(matches.getByRole("button", { name: /E2E commute farther.*48 min.*street route/ })).toBeVisible();
    expect(requests).toBe(before);
    await page.getByRole("button", { name: "walk", exact: true }).click();
    await expect(page.locator(".commute-estimate-list article").filter({ hasText: "walk" })).toBeVisible();
  } finally { await removeCommuteE2EListings(ids); }
});
