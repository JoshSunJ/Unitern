import type { Coordinates } from "@/features/listings/types";
import type { LocationSearchResult } from "@/features/location-search/types";

export const CITY_PREFERENCE_COOKIE = "unitern_city";

export type CityPreference = LocationSearchResult & {
  boundingBox?: [number, number, number, number];
};

export const defaultCity: CityPreference = {
  id: "unitern.san-jose",
  label: "San Jose, California, United States",
  shortLabel: "San Jose",
  type: "place",
  coordinates: { latitude: 37.3352, longitude: -121.8811 },
  boundingBox: [-122.08, 37.12, -121.68, 37.55],
};

function isCoordinate(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number"
    && Number.isFinite(value)
    && value >= minimum
    && value <= maximum;
}

export function parseCityPreference(value: unknown): CityPreference | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<CityPreference>;
  const coordinates = candidate.coordinates as Partial<Coordinates> | undefined;
  if (
    typeof candidate.id !== "string"
    || typeof candidate.label !== "string"
    || typeof candidate.shortLabel !== "string"
    || !coordinates
    || !isCoordinate(coordinates.latitude, -90, 90)
    || !isCoordinate(coordinates.longitude, -180, 180)
  ) {
    return null;
  }

  const boundingBox = candidate.boundingBox;
  const hasValidBounds = Array.isArray(boundingBox)
    && boundingBox.length === 4
    && boundingBox.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
    && boundingBox[0] >= -180 && boundingBox[2] <= 180
    && boundingBox[1] >= -90 && boundingBox[3] <= 90
    && boundingBox[0] < boundingBox[2] && boundingBox[1] < boundingBox[3];

  return {
    id: candidate.id.slice(0, 200),
    label: candidate.label.slice(0, 240),
    shortLabel: candidate.shortLabel.slice(0, 120),
    type: "place",
    coordinates: {
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    },
    boundingBox: hasValidBounds
      ? boundingBox as [number, number, number, number]
      : undefined,
  };
}

export function serializeCityPreference(city: CityPreference) {
  return JSON.stringify(city);
}

export function deserializeCityPreference(value: string | undefined) {
  if (!value) return null;

  try {
    const serializedCity = value.startsWith("%") ? decodeURIComponent(value) : value;
    return parseCityPreference(JSON.parse(serializedCity));
  } catch {
    return null;
  }
}

export function isInCityArea(coordinates: Coordinates | undefined, city: CityPreference) {
  if (!coordinates) return false;
  if (city.boundingBox) {
    const [west, south, east, north] = city.boundingBox;
    return coordinates.longitude >= west
      && coordinates.longitude <= east
      && coordinates.latitude >= south
      && coordinates.latitude <= north;
  }

  return Math.abs(coordinates.latitude - city.coordinates.latitude) < 0.55
    && Math.abs(coordinates.longitude - city.coordinates.longitude) < 0.7;
}
