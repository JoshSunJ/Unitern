import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`navigation opens, closes, and routes at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "Open menu", exact: true });
    const menu = page.locator("#site-menu");
    await expect(menu).toBeHidden();
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(menu).toBeVisible();
    await expect(page.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
    if (viewport.width > 900) {
      await trigger.click();
      await page.getByRole("navigation", { name: "Main", exact: true }).getByRole("link", { name: "Homes", exact: true }).click();
      await expect(menu).toBeHidden();
      await page.goto("/");
    }
    await trigger.click();
    await page.getByRole("heading", { level: 1 }).click();
    await expect(menu).toBeHidden();
    await trigger.click();
    await page.getByRole("navigation", { name: "Explore menu" }).getByRole("link", { name: "Housing requests" }).click();
    await expect(page).toHaveURL(/\/requests$/);
    await expect(page.getByRole("button", { name: "Open menu" })).toHaveAttribute("aria-expanded", "false");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("scroll reveals features and advances the route illustration", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const route = page.locator(".home-route");
  await expect(page.locator(".home-experience")).toHaveAttribute("data-motion", "ready");
  const before = await route.evaluate(element => Number((element as HTMLElement).style.getPropertyValue("--route-progress")));
  await page.mouse.wheel(0, 650);
  await expect.poll(() => route.evaluate(element => Number((element as HTMLElement).style.getPropertyValue("--route-progress")))).toBeGreaterThan(before);
  const feature = page.locator(".home-feature").first();
  await feature.scrollIntoViewIfNeeded();
  await expect(feature).toHaveAttribute("data-revealed", "true");
  await expect(feature).toHaveCSS("opacity", "1");
});

test("the route stays below the hero copy when the menu expands", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    for (const menuOpen of [false, true]) {
      if (menuOpen) await page.getByRole("button", { name: "Open menu", exact: true }).click();
      await expect.poll(() => page.evaluate(() => {
        const hero = document.querySelector(".hero--home")!.getBoundingClientRect();
        const copy = document.querySelector(".hero-copy")!.getBoundingClientRect();
        const route = document.querySelector(".home-route")!.getBoundingClientRect();
        return route.top >= copy.bottom && route.bottom <= hero.bottom + 1;
      })).toBe(true);
    }
  }
});

test("reduced motion keeps all content readable without scroll effects", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".home-experience")).not.toHaveAttribute("data-motion", "ready");
  await expect(page.locator(".home-feature").first()).toHaveCSS("opacity", "1");
  await expect(page.locator("html")).toHaveCSS("scroll-behavior", "auto");
});

test("the footer exposes existing features and returns to the page top", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("navigation", { name: "Footer", exact: true });
  await footer.scrollIntoViewIfNeeded();
  await expect(footer.getByRole("link", { name: "Area & commute guide" })).toHaveAttribute("href", "/map");
  await expect(footer.getByRole("link", { name: "Messages" })).toHaveAttribute("href", "/inquiries");
  await page.getByRole("link", { name: "Back to top" }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(10);
});
