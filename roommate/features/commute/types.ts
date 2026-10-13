import type { CommuteMode } from "@/features/preferences/types";

export type CommuteEstimate = {
  mode: CommuteMode;
  distanceMiles: number;
  durationMinutes: number;
  withinLimit: boolean;
  explanation: string;
};

export type RoadRoutableMode = Exclude<CommuteMode, "transit">;

export type CommuteRoute = {
  mode: RoadRoutableMode;
  distanceMiles: number;
  durationMinutes: number;
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
  provider: "mapbox" | "osrm";
};

const roadRoutableModes = new Set<string>([
  "drive",
  "bike",
  "walk",
  "ride share",
]);

export function isRoadRoutableMode(mode: string): mode is RoadRoutableMode {
  return roadRoutableModes.has(mode);
}
