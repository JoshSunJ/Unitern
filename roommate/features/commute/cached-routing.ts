import { getOpenStreetMapRoute, getRoadRoute } from "./routing";
import type { CommuteRoute, RoadRoutableMode } from "./types";
import type { Coordinates } from "@/features/listings/types";
import { enforceRateLimit } from "@/features/security/rate-limit";

const cache = new Map<string, { route: CommuteRoute; expires: number }>();
const pending = new Map<string, Promise<CommuteRoute>>();
const MAX_CACHE_ENTRIES = 200;

// Shared database counters enforce the public service's 1 request/second policy
// across replicas. Caching and a small daily budget keep this a preview service.
async function publicProviderSlot() {
  for (let attempt = 0; attempt < 6; attempt++) {
    const slot = await enforceRateLimit({ scope: "routing-provider-second", limit: 1, windowMs: 1_100 }, "osrm");
    if (slot.allowed) {
      const budget = await enforceRateLimit({ scope: "routing-provider-day", limit: 200, windowMs: 86_400_000 }, "osrm");
      if (!budget.allowed) throw new Error("Street routing preview budget reached.");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, slot.retryAfterSeconds * 1_000));
  }
  throw new Error("Street routing is busy. Try again shortly.");
}

export async function getCachedRoadRoutes(origin: Coordinates, destination: Coordinates, modes: RoadRoutableMode[], requestOrigin: string): Promise<CommuteRoute[]> {
  const token = process.env.MAPBOX_ACCESS_TOKEN?.trim();
  const routes: CommuteRoute[] = [];
  for (const mode of [...new Set(modes)]) {
    // Driving and ride share use the same road geometry; pickup is added below.
    const networkMode = mode === "ride share" ? "drive" : mode;
    const key = [token ? "mapbox" : "osrm", origin.longitude, origin.latitude, destination.longitude, destination.latitude, networkMode].join("|");
    const cached = cache.get(key);
    let route = cached && cached.expires > Date.now() ? cached.route : undefined;
    if (!route) {
      let task = pending.get(key);
      if (!task) {
        task = (async () => {
          if (!token) await publicProviderSlot();
          const result = token
            ? await getRoadRoute(origin, destination, networkMode, token)
            : await getOpenStreetMapRoute(origin, destination, networkMode, requestOrigin);
          if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
          cache.set(key, { route: result, expires: Date.now() + 3_600_000 });
          return result;
        })();
        pending.set(key, task);
      }
      try { route = await task; } finally { pending.delete(key); }
    }
    routes.push({ ...route, mode, durationMinutes: route.durationMinutes + (mode === "ride share" ? 7 : 0) });
  }
  return routes;
}
