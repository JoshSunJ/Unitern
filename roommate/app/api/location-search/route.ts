import type { NextRequest } from "next/server";

import { LocationSearchProviderError, searchLocations } from "@/features/location-search/service";
import type { LocationSearchKind } from "@/features/location-search/types";
import { normalizeEnvironmentValue } from "@/lib/environment-value";
import { logOperationalError } from "@/lib/operational-log";

const validKinds = new Set<LocationSearchKind>([
  "city",
  "destination",
  "address",
]);

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const requestedKind = request.nextUrl.searchParams.get("kind") ?? "address";

  if (query.length < 2 || query.length > 120) {
    return Response.json(
      { error: "Search with between 2 and 120 characters." },
      { status: 400 },
    );
  }

  if (!validKinds.has(requestedKind as LocationSearchKind)) {
    return Response.json({ error: "Unsupported search type." }, { status: 400 });
  }

  const apiKey = normalizeEnvironmentValue(process.env.MAPTILER_API_KEY);
  if (!apiKey) {
    return Response.json(
      { error: "Location search is temporarily unavailable. Please try again later." },
      { status: 503 },
    );
  }

  const rawLongitude = request.nextUrl.searchParams.get("longitude");
  const rawLatitude = request.nextUrl.searchParams.get("latitude");
  const longitude = rawLongitude === null ? undefined : Number(rawLongitude);
  const latitude = rawLatitude === null ? undefined : Number(rawLatitude);
  const proximity = longitude !== undefined
    && latitude !== undefined
    && Number.isFinite(longitude)
    && Number.isFinite(latitude)
    && longitude >= -180
    && longitude <= 180
    && latitude >= -90
    && latitude <= 90
    ? { longitude, latitude }
    : undefined;
  const rawBoundingBox = request.nextUrl.searchParams.get("bbox");
  const boundingBoxValues = rawBoundingBox?.split(",").map(Number);
  const boundingBox = boundingBoxValues?.length === 4
    && boundingBoxValues.every(Number.isFinite)
    && boundingBoxValues[0] >= -180
    && boundingBoxValues[2] <= 180
    && boundingBoxValues[1] >= -90
    && boundingBoxValues[3] <= 90
    && boundingBoxValues[0] < boundingBoxValues[2]
    && boundingBoxValues[1] < boundingBoxValues[3]
    ? boundingBoxValues as [number, number, number, number]
    : undefined;

  try {
    const results = await searchLocations({
      query,
      kind: requestedKind as LocationSearchKind,
      proximity,
      boundingBox,
    }, apiKey, process.env.AUTH_URL ? new URL(process.env.AUTH_URL).origin : request.nextUrl.origin);

    return Response.json({ results });
  } catch (error) {
    logOperationalError("location_search.failed", {
      kind: requestedKind,
      providerStatus: error instanceof LocationSearchProviderError ? error.status : undefined,
    });
    return Response.json(
      { error: "The location provider could not complete this search." },
      { status: 502 },
    );
  }
}
