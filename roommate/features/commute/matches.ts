import { compareCommuteModes } from "./service";
import type { CommuteRoute } from "./types";
import type { Coordinates, Listing } from "@/features/listings/types";
import type { CommuteMode } from "@/features/preferences/types";

export function compareHomeCommutes(listings: Listing[], destination: Coordinates, modes: CommuteMode[], maxMinutes: number, routesByHome: Record<number, CommuteRoute[]> = {}) {
  return listings.flatMap((listing) => {
    if (!listing.coordinates) return [];
    const estimates = compareCommuteModes(listing.coordinates, destination, modes, maxMinutes).map((estimate) => {
      const road = routesByHome[listing.id]?.find((route) => route.mode === estimate.mode);
      return { ...estimate, durationMinutes: road?.durationMinutes ?? estimate.durationMinutes, distanceMiles: road?.distanceMiles ?? estimate.distanceMiles, withinLimit: (road?.durationMinutes ?? estimate.durationMinutes) <= maxMinutes, routed: Boolean(road) };
    }).sort((a, b) => a.durationMinutes - b.durationMinutes);
    const fastest = estimates[0];
    return fastest ? [{ listing, fastest, estimates, withinLimit: fastest.withinLimit }] : [];
  }).sort((a, b) => a.fastest.durationMinutes - b.fastest.durationMinutes);
}
