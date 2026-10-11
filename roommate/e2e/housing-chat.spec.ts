import { expect, test } from "@playwright/test";
import { Pool } from "pg";

const email = `housing-chat-browser-${process.pid}@unitern.local`;
const listingIds: number[] = [];
let ownerId: number;

test.beforeAll(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    ownerId = (await pool.query('INSERT INTO "User" (name, email) VALUES ($1, $2) RETURNING id', ["Chat browser fixture", email])).rows[0].id;
    for (const title of ["Chat browser home one", "Chat browser home two"]) {
      const result = await pool.query(`INSERT INTO "Listing" (title, rent, location, description, bedrooms, "bathroomType", "availableFrom", "postedBy", "ownerId", latitude, longitude, "updatedAt") VALUES ($1, 1200, 'San Jose, CA', 'A furnished room near campus', 2, 'Shared', '2026-11-01', 'Chat browser fixture', $2, 37.33, -121.88, NOW()) RETURNING id`, [title, ownerId]);
      listingIds.push(result.rows[0].id);
    }
  } finally { await pool.end(); }
});

test.afterAll(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try { await pool.query('DELETE FROM "Listing" WHERE "ownerId"=$1', [ownerId]); await pool.query('DELETE FROM "User" WHERE email=$1', [email]); } finally { await pool.end(); }
});

test("chat follows the listing, requires consent and survives navigation with separate listing conversations", async ({ page }) => {
  let sent: { listingId: number } | undefined;
  await page.route("**/api/housing-chat", async route => {
    if (route.request().method() !== "POST") return route.continue();
    sent = route.request().postDataJSON();
    await route.fulfill({ json: { answer: "Check utilities, deposit and roommate rules in writing.", sources: [{ id: "listing", title: "Listing details", url: `/listings/${listingIds[0]}` }], listing: null, mapStatus: "available" } });
  });
  await page.goto(`/listings/${listingIds[0]}`);
  await page.getByRole("button", { name: "Open housing guide" }).click();
  const dialog = page.getByRole("dialog", { name: "Unitern housing guide" });
  await expect(dialog.getByLabel("ASKING ABOUT")).toHaveValue(String(listingIds[0]));
  await dialog.getByLabel("Your housing question").fill("What should I check before moving?");
  await expect(dialog.getByRole("button", { name: "Send housing question" })).toBeDisabled();
  await dialog.getByRole("checkbox", { name: /I’m 18/ }).click();
  await dialog.getByRole("button", { name: "Send housing question" }).click();
  await expect(dialog.getByText("Check utilities, deposit and roommate rules in writing.")).toBeVisible();
  expect(sent?.listingId).toBe(listingIds[0]);
  await expect(dialog.getByRole("link", { name: /Listing details/ })).toHaveAttribute("href", `/listings/${listingIds[0]}`);
  await page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "Area & commute guide" }).click();
  await expect(page).toHaveURL(/\/map$/);
  await expect(dialog.getByText("Check utilities, deposit and roommate rules in writing.")).toBeVisible();
  await expect(dialog.getByLabel("ASKING ABOUT")).toHaveValue(String(listingIds[0]));
  await page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "Find a home", exact: true }).click();
  await page.locator(`a[href="/listings/${listingIds[1]}"]`).first().click();
  await expect(dialog.getByLabel("ASKING ABOUT")).toHaveValue(String(listingIds[1]));
  await expect(dialog.getByText("Check utilities, deposit and roommate rules in writing.")).toHaveCount(0);
  await dialog.getByLabel("ASKING ABOUT").selectOption(String(listingIds[0]));
  await expect(dialog.getByText("Check utilities, deposit and roommate rules in writing.")).toBeVisible();
  await dialog.getByLabel("Your housing question").press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open housing guide" })).toBeFocused();
  await page.getByRole("button", { name: "Open housing guide" }).click();
  await expect(page.getByText("Check utilities, deposit and roommate rules in writing.")).toBeVisible();
});

test("a mobile area question retains its draft during quota errors and safely renders model text", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/location-search?*", route => route.fulfill({ json: { results: [{ id: "area", label: "Downtown San Jose, CA", shortLabel: "Downtown", type: "place", coordinates: { latitude: 37.33, longitude: -121.88 } }] } }));
  let calls = 0;
  await page.route("**/api/housing-chat", async route => {
    if (route.request().method() !== "POST") return route.continue();
    const input = route.request().postDataJSON();
    expect(input.area.label).toBe("Downtown San Jose, CA");
    expect(input.listingId).toBeNull();
    if (++calls === 1) return route.fulfill({ status: 429, headers: { "Retry-After": "1" }, json: { error: "Free model is at capacity." } });
    await route.fulfill({ json: { answer: "<img src=x onerror=alert(1)> Check the actual block and commute.", sources: [], listing: null, mapStatus: "unavailable" } });
  });
  await page.goto("/sign-up");
  await page.getByRole("button", { name: "Open housing guide" }).click();
  const dialog = page.getByRole("dialog", { name: "Unitern housing guide" });
  await dialog.getByRole("combobox", { name: "Search an area" }).fill("Downtown");
  await dialog.getByRole("option", { name: /Downtown/ }).click();
  await dialog.getByRole("checkbox", { name: /I’m 18/ }).click();
  await dialog.getByLabel("Your housing question").fill("What should I know about this area?");
  await dialog.getByRole("button", { name: "Send housing question" }).click();
  await expect(dialog.getByText(/Free model is at capacity/)).toBeVisible();
  await expect(dialog.getByLabel("Your housing question")).toHaveValue("What should I know about this area?");
  await expect(dialog.getByRole("button", { name: "Send housing question" })).toBeEnabled({ timeout: 3500 });
  await dialog.getByRole("button", { name: "Send housing question" }).click();
  await expect(dialog.getByText(/<img src=x onerror=alert/)).toBeVisible();
  expect(await dialog.locator("img").count()).toBe(0);
  await expect(dialog.getByText("Nearby map data was unavailable for this answer.")).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  // Keep the composer reachable when a small viewport or keyboard reduces space.
  await page.setViewportSize({ width: 390, height: 420 });
  const panel = await dialog.boundingBox();
  const composer = await dialog.getByLabel("Your housing question").boundingBox();
  expect(composer!.y).toBeGreaterThanOrEqual(panel!.y);
  expect(composer!.y + composer!.height).toBeLessThanOrEqual(panel!.y + panel!.height);
});

test("backend rejects cross-site posts, missing consent and oversized bodies without invoking a model", async ({ request }) => {
  const endpoint = "/api/housing-chat";
  const valid = { message: "Where is this listing?", listingId: null, consent: true, history: [] };
  expect((await request.post(endpoint, { headers: { Origin: "https://attacker.example" }, data: valid })).status()).toBe(403);
  expect((await request.post(endpoint, { headers: { Origin: "http://localhost:3000" }, data: { ...valid, consent: false } })).status()).toBe(400);
  expect((await request.post(endpoint, { headers: { Origin: "http://localhost:3000" }, data: { ...valid, message: "x".repeat(19_000) } })).status()).toBe(413);
});
