import { copyFile, mkdir, readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const { version } = JSON.parse(await readFile(require.resolve("maplibre-gl/package.json"), "utf8"));
const distribution = dirname(require.resolve("maplibre-gl/dist/maplibre-gl-worker.mjs"));
const output = new URL(`../public/maplibre/${version}/`, import.meta.url);

await mkdir(output, { recursive: true });
// The worker imports shared ESM chunks; preserve their relative paths.
for (const file of await readdir(distribution)) {
  if (file.endsWith(".mjs")) await copyFile(join(distribution, file), new URL(file, output));
}
