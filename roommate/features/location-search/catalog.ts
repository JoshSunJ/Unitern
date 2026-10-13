import { defaultCity, type CityPreference } from "./city-preference";
import type { LocationSearchInput, LocationSearchResult } from "./types";

export const cityChoices: CityPreference[] = [
  defaultCity,
  { id: "unitern.los-angeles", label: "Los Angeles, California, United States", shortLabel: "Los Angeles", type: "municipality", coordinates: { latitude: 34.0522, longitude: -118.2437 }, boundingBox: [-118.67, 33.7, -118.15, 34.34] },
  { id: "unitern.san-francisco", label: "San Francisco, California, United States", shortLabel: "San Francisco", type: "municipality", coordinates: { latitude: 37.7749, longitude: -122.4194 }, boundingBox: [-122.52, 37.7, -122.35, 37.84] },
  { id: "unitern.berkeley", label: "Berkeley, California, United States", shortLabel: "Berkeley", type: "municipality", coordinates: { latitude: 37.8715, longitude: -122.273 }, boundingBox: [-122.33, 37.83, -122.23, 37.92] },
];

// Campus centers are approximate planning pins, not building entrances.
// Main-campus addresses: sjsu.edu/map and newsroom.ucla.edu/ucla-fast-facts.
export const campusChoices: Array<LocationSearchResult & { aliases: string[]; cityId: string }> = [
  { id: "unitern.sjsu", shortLabel: "San José State University (SJSU)", label: "San José State University (SJSU) · Main campus, San Jose, California", type: "poi", coordinates: { latitude: 37.3352, longitude: -121.8811 }, cityId: defaultCity.id, aliases: ["sjsu", "s j s u", "san jose state", "san jose state university"] },
  { id: "unitern.ucla", shortLabel: "University of California, Los Angeles (UCLA)", label: "University of California, Los Angeles (UCLA) · Westwood campus, Los Angeles, California", type: "poi", coordinates: { latitude: 34.0689, longitude: -118.4452 }, cityId: "unitern.los-angeles", aliases: ["ucla", "u c l a", "uc los angeles", "university of california los angeles"] },
  { id: "unitern.usc", shortLabel: "University of Southern California (USC)", label: "University of Southern California (USC) · University Park, Los Angeles, California", type: "poi", coordinates: { latitude: 34.0224, longitude: -118.2851 }, cityId: "unitern.los-angeles", aliases: ["usc", "u s c", "university of southern california"] },
  { id: "unitern.sfsu", shortLabel: "San Francisco State University (SFSU)", label: "San Francisco State University (SFSU) · San Francisco, California", type: "poi", coordinates: { latitude: 37.7219, longitude: -122.4782 }, cityId: "unitern.san-francisco", aliases: ["sfsu", "s f s u", "san francisco state", "san francisco state university"] },
  { id: "unitern.uc-berkeley", shortLabel: "University of California, Berkeley (UC Berkeley)", label: "University of California, Berkeley (UC Berkeley) · Berkeley, California", type: "poi", coordinates: { latitude: 37.8719, longitude: -122.2585 }, cityId: "unitern.berkeley", aliases: ["ucb", "uc berkeley", "university of california berkeley"] },
];

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

export function knownCampusResults(input: LocationSearchInput): LocationSearchResult[] {
  if (input.kind !== "destination") return [];
  const query = normalize(input.query);
  return campusChoices.filter((campus) => campus.aliases.some((alias) => normalize(alias) === query))
    .map((campus) => ({ id: campus.id, label: campus.label, shortLabel: campus.shortLabel, type: campus.type, coordinates: campus.coordinates, cityId: campus.cityId }));
}
