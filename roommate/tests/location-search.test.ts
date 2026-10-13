import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMapTilerSearchUrl,
  normalizeMapTilerResults,
  searchLocations,
} from "../features/location-search/service";

test("a server key copied with .env quotes still authenticates the search request", () => {
  for (const key of [' "test-key" ', " 'test-key' ", "test-key"]) {
    const url = buildMapTilerSearchUrl({ query: "Adobe", kind: "destination" }, key);
    assert.equal(url.searchParams.get("key"), "test-key");
  }
});

test("US city search restricts and normalizes provider parameters", () => {
  const url = buildMapTilerSearchUrl({
    query: "New York",
    kind: "city",
  }, "test-key");

  assert.equal(url.hostname, "api.maptiler.com");
  assert.equal(url.pathname, "/geocoding/New%20York.json");
  assert.equal(url.searchParams.get("country"), "us");
  assert.equal(
    url.searchParams.get("types"),
    "municipality,subregion,place",
  );
  assert.equal(url.searchParams.get("fuzzyMatch"), "false");
  assert.equal(url.searchParams.get("key"), "test-key");
});

test("destination search is biased toward the selected city", () => {
  const url = buildMapTilerSearchUrl({
    query: "university",
    kind: "destination",
    proximity: { latitude: 42.3601, longitude: -71.0589 },
    boundingBox: [-71.1912, 42.2279, -70.986, 42.3973],
  }, "test-key");

  assert.equal(url.searchParams.get("types"), "poi");
  assert.equal(url.searchParams.get("proximity"), "-71.0589,42.3601");
  assert.equal(url.searchParams.get("bbox"), "-71.1912,42.2279,-70.986,42.3973");
});

test("provider results expose only the normalized location contract", () => {
  const results = normalizeMapTilerResults({
    features: [{
      id: "place.123",
      text: "Boston",
      place_name: "Boston, Massachusetts, United States",
      place_type: ["place"],
      center: [-71.0589, 42.3601],
      bbox: [-71.1912, 42.2279, -70.986, 42.3973],
    }],
  });

  assert.deepEqual(results[0], {
    id: "place.123",
    label: "Boston, Massachusetts, United States",
    shortLabel: "Boston",
    type: "place",
    coordinates: { latitude: 42.3601, longitude: -71.0589 },
    boundingBox: [-71.1912, 42.2279, -70.986, 42.3973],
  });
});

test("server search forwards the app origin to a restricted MapTiler key", async () => {
  let forwardedOrigin: string | null = null;
  const fetcher = (async (_input: URL | RequestInfo, init?: RequestInit) => {
    forwardedOrigin = new Headers(init?.headers).get("Origin");
    return Response.json({ features: [] });
  }) as typeof fetch;

  await searchLocations(
    { query: "San Jose", kind: "city" },
    "test-key",
    "http://localhost:3000",
    fetcher,
  );

  assert.equal(forwardedOrigin, "http://localhost:3000");
});

test("city search prefers an exact administrative city over similarly named places", async () => {
  const fetcher = (async () => Response.json({
    features: [
      {
        id: "place.chicago-corners",
        text: "Chicago Corners",
        place_name: "Chicago Corners, Wisconsin, United States",
        place_type: ["place"],
        relevance: 1,
        center: [-88.25, 44.45],
      },
      {
        id: "municipality.chicago",
        text: "Chicago",
        place_name: "Chicago, Illinois, United States",
        place_type: ["municipality"],
        relevance: 1,
        center: [-87.62, 41.88],
        bbox: [-87.94, 41.64, -87.52, 42.02],
      },
    ],
  })) as typeof fetch;

  const results = await searchLocations(
    { query: "Chicago", kind: "city" },
    "test-key",
    "http://localhost:3000",
    fetcher,
  );

  assert.deepEqual(results.map(({ shortLabel }) => shortLabel), ["Chicago"]);
  assert.equal(results[0]?.type, "municipality");
});

test("campus shortcuts resolve exactly, including punctuation, accents, and an unrelated city scope", async () => {
  for (const [query, campus] of [["UCLA", "unitern.ucla"], ["sjsu", "unitern.sjsu"], ["U.C.L.A.", "unitern.ucla"], ["San José State University", "unitern.sjsu"]]) {
    const results = await searchLocations({ query, kind: "destination", proximity: { latitude: 40, longitude: -73 }, boundingBox: [-74, 39, -72, 41] }, "", "https://unitern.example", async () => { throw new Error("Known campuses must not depend on the provider."); });
    assert.equal(results.length, 1);
    assert.equal(results[0].id, campus);
  }
});

test("city results exclude counties, neighborhoods, and POIs", async () => {
  const fetcher = (async () => Response.json({ features: [
    { id: "subregion.county", text: "Los Angeles County", place_type: ["subregion"], center: [-118.2, 34] },
    { id: "poi.ucla", text: "UCLA", place_type: ["poi"], center: [-118.445, 34.069] },
    { id: "municipality.la", text: "Los Angeles", place_type: ["municipality"], center: [-118.24, 34.052] },
  ] })) as typeof fetch;
  const results = await searchLocations({ query: "Los Angeles", kind: "city" }, "test", "https://unitern.example", fetcher);
  assert.deepEqual(results.map((result) => result.id), ["municipality.la"]);
});

test("ordinary destination results cannot escape the selected city bounds", async () => {
  const fetcher = (async () => Response.json({ features: [
    { id: "poi.other", text: "College", place_type: ["poi"], center: [-73, 40] },
    { id: "poi.local", text: "College", place_type: ["poi"], center: [-121.9, 37.33] },
  ] })) as typeof fetch;
  const results = await searchLocations({ query: "College", kind: "destination", proximity: { latitude: 37.33, longitude: -121.9 }, boundingBox: [-122, 37.1, -121.6, 37.5] }, "test", "https://unitern.example", fetcher);
  assert.deepEqual(results.map((result) => result.id), ["poi.local"]);
});

test("consolidated cities such as New York remain searchable while counties and hamlets are excluded", async () => {
  const fetcher = (async () => Response.json({ features: [
    { id: "subregion.county", text: "New York County", place_type: ["subregion"], properties: { place_designation: "county" }, center: [-74, 40.7] },
    { id: "place.hamlet", text: "New York", place_type: ["place"], properties: { place_designation: "hamlet" }, center: [-87, 30] },
    { id: "subregion.nyc", text: "New York", place_type: ["subregion"], properties: { place_designation: "city" }, center: [-74.006, 40.7127] },
  ] })) as typeof fetch;
  const results = await searchLocations({ query: "New York", kind: "city" }, "test", "https://unitern.example", fetcher);
  assert.deepEqual(results.map((result) => result.id), ["subregion.nyc"]);
});
