import type { Coordinates } from "@/features/listings/types";

export type LocationSearchKind = "city" | "destination" | "address";

export type LocationSearchResult = {
  id: string;
  label: string;
  shortLabel: string;
  type: string;
  coordinates: Coordinates;
  boundingBox?: [number, number, number, number];
  cityId?: string;
};

export type LocationSearchInput = {
  query: string;
  kind: LocationSearchKind;
  proximity?: Coordinates;
  boundingBox?: [number, number, number, number];
};
