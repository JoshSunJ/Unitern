import type { Coordinates } from "@/features/listings/types";
import { distanceInMiles } from "@/features/places/distance";

type MapElement = {
  id?: number; type?: string; lat?: number; lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};
export type NearbyPlace = {
  id: string; name: string; category: string; distanceMiles: number; url: string;
};
export type NearbyResult = {
  status: "available" | "unavailable" | "no-location";
  places: NearbyPlace[];
  fetchedAt: string | null;
};

const categories: Record<string, string> = {
  restaurant: "Restaurant", cafe: "Cafe", fast_food: "Casual food",
  bar: "Bar", pub: "Pub", library: "Library", cinema: "Cinema",
  pharmacy: "Pharmacy", supermarket: "Groceries", convenience: "Groceries",
  park: "Park", fitness_centre: "Gym", station: "Transit", tram_stop: "Transit",
};
const cache = new Map<string, { expires: number; value: Promise<NearbyResult> }>();

export function validCoordinates(value: Coordinates | null): value is Coordinates {
  return Boolean(value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude)
    && Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180);
}

export function normalizeNearbyPlaces(elements: MapElement[], origin: Coordinates): NearbyPlace[] {
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  const candidates = elements.flatMap(element => {
    const name = element.tags?.name?.trim();
    const category = categories[element.tags?.amenity ?? ""]
      ?? categories[element.tags?.shop ?? ""]
      ?? categories[element.tags?.leisure ?? ""]
      ?? categories[element.tags?.railway ?? ""];
    const coordinates = { latitude: element.lat ?? element.center?.lat ?? NaN, longitude: element.lon ?? element.center?.lon ?? NaN };
    if (!name || !category || !validCoordinates(coordinates)
      || !["node", "way", "relation"].includes(element.type ?? "")
      || !Number.isSafeInteger(element.id) || element.id! <= 0) return [];
    const distance = distanceInMiles(origin, coordinates);
    if (distance > 1) return [];
    return [{ id: `place-${element.type}-${element.id}`, name: name.slice(0, 100), category,
      distanceMiles: Math.round(distance * 100) / 100,
      url: `https://www.openstreetmap.org/${element.type}/${element.id}` }];
  }).sort((a, b) => a.distanceMiles - b.distanceMiles).filter(place => {
    const key = `${place.name.toLowerCase()}:${place.category}`;
    const count = counts.get(place.category) ?? 0;
    if (seen.has(key) || count >= 3) return false;
    seen.add(key); counts.set(place.category, count + 1); return true;
  });
  // Preserve category variety before filling with the closest remaining places:
  // a dense restaurant cluster must not crowd out a park or transit stop.
  const selected = new Set<string>();
  const represented = new Set<string>();
  for (const place of candidates) {
    if (!represented.has(place.category)) { selected.add(place.id); represented.add(place.category); }
  }
  for (const place of candidates) {
    if (selected.size >= 20) break;
    selected.add(place.id);
  }
  return candidates.filter(place => selected.has(place.id));
}

export async function fetchNearbyPlaces(origin: Coordinates, fetcher: typeof fetch = fetch): Promise<NearbyResult> {
  if (!validCoordinates(origin)) return { status: "no-location", places: [], fetchedAt: null };
  const around = `around:1500,${origin.latitude.toFixed(5)},${origin.longitude.toFixed(5)}`;
  const query = `[out:json][timeout:10];(nwr(${around})[name][amenity~"^(restaurant|cafe|fast_food|bar|pub|library|cinema|pharmacy)$"];nwr(${around})[name][shop~"^(supermarket|convenience)$"];nwr(${around})[name][leisure~"^(park|fitness_centre)$"];nwr(${around})[name][railway~"^(station|tram_stop)$"];);out center 1000;`;
  try {
    const url = new URL("https://overpass-api.de/api/interpreter");
    url.searchParams.set("data", query);
    const response = await fetcher(url, {
      headers: { Accept: "application/json", "User-Agent": "Unitern/1.0 housing-location-assistant" },
      signal: AbortSignal.timeout(12_000), cache: "no-store",
    });
    if (!response.ok) throw new Error("Map unavailable");
    const raw = await response.text();
    if (raw.length > 1_000_000) throw new Error("Map response too large");
    const data = JSON.parse(raw) as { elements?: MapElement[]; remark?: string };
    if (!Array.isArray(data.elements) || data.remark) throw new Error("Incomplete map response");
    return { status: "available", places: normalizeNearbyPlaces(data.elements, origin), fetchedAt: new Date().toISOString() };
  } catch {
    return { status: "unavailable", places: [], fetchedAt: null };
  }
}

export async function getNearbyPlaces(origin: Coordinates | null): Promise<NearbyResult> {
  if (!validCoordinates(origin)) return { status: "no-location", places: [], fetchedAt: null };
  const key = `${origin.latitude.toFixed(5)},${origin.longitude.toFixed(5)}`;
  const existing = cache.get(key);
  if (existing && existing.expires > Date.now()) return existing.value;
  if (cache.size >= 50) cache.delete(cache.keys().next().value!);
  const value = fetchNearbyPlaces(origin);
  cache.set(key, { expires: Date.now() + 60 * 60 * 1000, value });
  // A provider failure is cached briefly, rather than disguising stale data as fresh.
  void value.then(result => { if (result.status !== "available") {
    const entry = cache.get(key); if (entry?.value === value) entry.expires = Date.now() + 60_000;
  } });
  return value;
}
