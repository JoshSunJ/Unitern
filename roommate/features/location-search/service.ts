import type {
  LocationSearchInput,
  LocationSearchResult,
} from "@/features/location-search/types";
import { normalizeEnvironmentValue } from "@/lib/environment-value";

type MapTilerFeature = {
  id?: string;
  type?: string;
  place_type?: string[];
  text?: string;
  place_name?: string;
  center?: [number, number];
  bbox?: [number, number, number, number];
  relevance?: number;
  matching_text?: string;
};

type MapTilerResponse = { features?: MapTilerFeature[] };

export class LocationSearchProviderError extends Error {
  constructor(readonly status: number) {
    super(`MapTiler search failed with status ${status}.`);
  }
}

export function buildMapTilerSearchUrl(
  input: LocationSearchInput,
  apiKey: string,
) {
  const url = new URL(
    `https://api.maptiler.com/geocoding/${encodeURIComponent(input.query)}.json`,
  );
  url.searchParams.set("key", normalizeEnvironmentValue(apiKey) ?? "");
  url.searchParams.set("country", "us");
  url.searchParams.set("language", "en");
  url.searchParams.set("worldview", "us");
  url.searchParams.set("autocomplete", "true");
  url.searchParams.set("limit", "7");

  if (input.kind === "city") {
    url.searchParams.set(
      "types",
      "municipality,subregion,municipal_district,locality,place",
    );
    url.searchParams.set("fuzzyMatch", "false");
  }
  if (input.kind === "destination") url.searchParams.set("types", "poi");
  if (input.proximity) {
    url.searchParams.set(
      "proximity",
      `${input.proximity.longitude},${input.proximity.latitude}`,
    );
  }
  if (input.boundingBox) {
    url.searchParams.set("bbox", input.boundingBox.join(","));
  }

  return url;
}

const cityTypePriority: Record<string, number> = {
  municipality: 50,
  subregion: 45,
  municipal_district: 40,
  locality: 30,
  place: 10,
};

function rankCityFeatures(features: MapTilerFeature[], query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase("en-US");
  const scored = features.map((feature, originalIndex) => {
    const featureType = feature.place_type?.[0] ?? feature.type ?? "place";
    const candidateText = feature.matching_text ?? feature.text ?? "";
    const exactNameMatch = candidateText.toLocaleLowerCase("en-US") === normalizedQuery;
    const score = (exactNameMatch ? 100 : 0)
      + (cityTypePriority[featureType] ?? 0)
      + (feature.relevance ?? 0) * 10;

    return { feature, featureType, originalIndex, score };
  });
  const administrative = scored.filter(({ featureType }) => featureType !== "place");
  const candidates = administrative.length > 0 ? administrative : scored;

  return candidates
    .sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex)
    .map(({ feature }) => feature);
}

export function normalizeMapTilerResults(
  data: MapTilerResponse,
): LocationSearchResult[] {
  return (data.features ?? []).flatMap((feature) => {
    if (!feature.center) return [];
    const [longitude, latitude] = feature.center;
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return [];

    const label = feature.place_name ?? feature.text;
    if (!label) return [];

    return [{
      id: feature.id ?? `${longitude},${latitude}`,
      label,
      shortLabel: feature.text ?? label,
      type: feature.place_type?.[0] ?? feature.type ?? "place",
      coordinates: { latitude, longitude },
      boundingBox: feature.bbox,
    }];
  });
}

export async function searchLocations(
  input: LocationSearchInput,
  apiKey: string,
  requestOrigin: string,
  fetcher: typeof fetch = fetch,
) {
  const response = await fetcher(buildMapTilerSearchUrl(input, apiKey), {
    headers: {
      Accept: "application/json",
      Origin: requestOrigin,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    throw new LocationSearchProviderError(response.status);
  }

  const data = await response.json() as MapTilerResponse;
  const features = input.kind === "city"
    ? rankCityFeatures(data.features ?? [], input.query)
    : data.features ?? [];

  return normalizeMapTilerResults({ features });
}
