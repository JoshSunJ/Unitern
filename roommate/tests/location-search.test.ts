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
    "municipality,subregion,municipal_district,locality,place",
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
