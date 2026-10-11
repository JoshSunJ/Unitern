import { expect, test } from "@playwright/test";
import sharp from "sharp";

// A real GeoJSON source exercises MapLibre's worker without provider keys or
// external tile requests. Background-only rendering must not pass this check.
const mapStyle = {
  version: 8,
  sources: {
    neighborhood: {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [[[-123, 36], [-120, 36], [-120, 39], [-123, 39], [-123, 36]]],
          },
        }],
      },
    },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#fffdf0" } },
    { id: "neighborhood", type: "fill", source: "neighborhood", paint: { "fill-color": "#1677cc" } },
  ],
};

for (const [path, selector] of [["/", ".housing-map-shell"], ["/map", ".location-map"]]) {
  test(`the ${path} map renders source features using its worker`, async ({ page }) => {
    await page.route("**/test-map-style.json", (route) => route.fulfill({ json: mapStyle }));
    await page.goto(path);
    const canvas = page.locator(`${selector} canvas`);
    await expect(canvas).toBeVisible();
    await expect.poll(async () => {
      const { data, info } = await sharp(await canvas.screenshot()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      let renderedPixels = 0;
      for (let offset = 0; offset < data.length; offset += info.channels) {
        if (data[offset] < 50 && data[offset + 1] > 80 && data[offset + 2] > 150) renderedPixels++;
      }
      return renderedPixels / (info.width * info.height);
    }, { timeout: 15_000 }).toBeGreaterThan(0.5);
  });
}
