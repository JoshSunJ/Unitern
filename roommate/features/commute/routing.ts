import type { Coordinates } from "@/features/listings/types";
import type {
  CommuteRoute,
  RoadRoutableMode,
} from "@/features/commute/types";

type MapboxProfile = "driving" | "cycling" | "walking";

type MapboxDirectionsResponse = {
  code?: string;
  message?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: {
      type?: string;
      coordinates?: unknown;
    };
  }>;
};

const profileByMode: Record<RoadRoutableMode, MapboxProfile> = {
  drive: "driving",
  bike: "cycling",
  walk: "walking",
  "ride share": "driving",
};

const fixedMinutesByMode: Record<RoadRoutableMode, number> = {
  drive: 0,
  bike: 0,
  walk: 0,
  "ride share": 7,
};

function isLineCoordinates(value: unknown): value is [number, number][] {
  return Array.isArray(value)
    && value.length >= 2
    && value.every((coordinate) =>
      Array.isArray(coordinate)
      && coordinate.length >= 2
      && Number.isFinite(coordinate[0])
      && Number.isFinite(coordinate[1])
      && Math.abs(coordinate[0]) <= 180
      && Math.abs(coordinate[1]) <= 90,
    );
}

export async function getRoadRoute(
  origin: Coordinates,
  destination: Coordinates,
  mode: RoadRoutableMode,
  accessToken: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<CommuteRoute> {
  const profile = profileByMode[mode];
  const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinates}`);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("overview", "full");
  url.searchParams.set("steps", "false");

  const response = await fetchImplementation(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  const body = await response.json() as MapboxDirectionsResponse;
  const route = body.routes?.[0];

  if (
    !response.ok
    || body.code !== "Ok"
    || !route
    || !Number.isFinite(route.distance)
    || !Number.isFinite(route.duration)
    || route.distance! < 0
    || route.duration! < 0
    || route.geometry?.type !== "LineString"
    || !isLineCoordinates(route.geometry.coordinates)
  ) {
    throw new Error(body.message ?? "The routing provider returned an invalid route.");
  }

  return {
    mode,
    distanceMiles: Number((route.distance! / 1609.344).toFixed(1)),
    durationMinutes: Math.max(
      1,
      Math.round(route.duration! / 60) + fixedMinutesByMode[mode],
    ),
    geometry: {
      type: "LineString",
      coordinates: route.geometry.coordinates,
    },
    provider: "mapbox",
  };
}

export async function getOpenStreetMapRoute(
  origin: Coordinates,
  destination: Coordinates,
  mode: RoadRoutableMode,
  requestOrigin: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<CommuteRoute> {
  const profile = mode === "bike" ? "bike" : mode === "walk" ? "foot" : "car";
  const points = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
  const url = new URL(`https://routing.openstreetmap.de/routed-${profile}/route/v1/driving/${points}`);
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("steps", "false");
  const response = await fetchImplementation(url, {
    headers: { Accept: "application/json", "User-Agent": `Unitern/1.0 (${requestOrigin})`, Referer: requestOrigin },
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
  });
  const body = await response.json() as MapboxDirectionsResponse;
  const route = body.routes?.[0];
  if (!response.ok || body.code !== "Ok" || !route || !Number.isFinite(route.distance) || route.distance! < 0 || !Number.isFinite(route.duration) || route.duration! < 0 || route.geometry?.type !== "LineString" || !isLineCoordinates(route.geometry.coordinates)) {
    throw new Error("Street routing is temporarily unavailable.");
  }
  return {
    mode,
    distanceMiles: Number((route.distance! / 1609.344).toFixed(1)),
    durationMinutes: Math.max(1, Math.round(route.duration! / 60) + fixedMinutesByMode[mode]),
    geometry: { type: "LineString", coordinates: route.geometry.coordinates },
    provider: "osrm",
  };
}

export async function getRoadRoutes(
  origin: Coordinates,
  destination: Coordinates,
  modes: RoadRoutableMode[],
  accessToken: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<CommuteRoute[]> {
  const uniqueModes = [...new Set(modes)];

  return Promise.all(uniqueModes.map((mode) =>
    getRoadRoute(origin, destination, mode, accessToken, fetchImplementation),
  ));
}
