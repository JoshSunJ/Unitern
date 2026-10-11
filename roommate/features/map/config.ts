import type { StyleSpecification } from "maplibre-gl";
import { normalizeEnvironmentValue } from "@/lib/environment-value";

const developmentRasterStyle: StyleSpecification = {
  version: 8,
  sources: {
    "open-street-map": {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
      maxzoom: 19,
    },
  },
  layers: [{
    id: "open-street-map",
    type: "raster",
    source: "open-street-map",
  }],
};

export function createMapTilerStyleUrl(apiKey: string): string {
  const styleUrl = new URL("https://api.maptiler.com/maps/streets-v4/style.json");
  styleUrl.searchParams.set("key", apiKey);
  return styleUrl.toString();
}

export const normalizePublicEnvValue = normalizeEnvironmentValue;

export function addMapTilerKey(styleUrl: string, apiKey: string | undefined): string {
  if (!apiKey) return styleUrl;

  const parsedUrl = new URL(styleUrl);
  if (parsedUrl.hostname !== "api.maptiler.com" || parsedUrl.searchParams.has("key")) {
    return styleUrl;
  }

  parsedUrl.searchParams.set("key", apiKey);
  return parsedUrl.toString();
}

// NEXT_PUBLIC_ is intentional: the browser must know which public map style
// to request. Never put a secret provider credential in this value.
const mapTilerKey = normalizePublicEnvValue(process.env.NEXT_PUBLIC_MAPTILER_KEY);
const configuredStyleUrl = normalizePublicEnvValue(process.env.NEXT_PUBLIC_MAP_STYLE_URL);

export const mapStyle: string | StyleSpecification =
  configuredStyleUrl
    ? addMapTilerKey(configuredStyleUrl, mapTilerKey)
    : mapTilerKey
      ? createMapTilerStyleUrl(mapTilerKey)
      : developmentRasterStyle;
