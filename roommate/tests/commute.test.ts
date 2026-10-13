import assert from "node:assert/strict";
import test from "node:test";

import {
  compareCommuteModes,
  estimateCommute,
} from "../features/commute/service";
import { getRoadRoute } from "../features/commute/routing";
import { isRoadRoutableMode } from "../features/commute/types";

const downtownSanJose = { latitude: 37.3352, longitude: -121.8811 };
const northSanJose = { latitude: 37.3746, longitude: -121.9227 };

test("commute estimates are deterministic and explain their assumptions", () => {
  const estimate = estimateCommute(
    downtownSanJose,
    northSanJose,
    "bike",
    30,
  );

  assert.equal(estimate.mode, "bike");
  assert.ok(estimate.distanceMiles > 0);
  assert.ok(estimate.durationMinutes > 0);
  assert.equal(estimate.withinLimit, true);
  assert.match(estimate.explanation, /cycling/);
});

test("mode comparison sorts the practical options by estimated duration", () => {
  const estimates = compareCommuteModes(
    downtownSanJose,
    northSanJose,
    ["walk", "drive", "bike"],
    30,
  );

  assert.deepEqual(estimates.map(({ mode }) => mode), ["drive", "bike", "walk"]);
  assert.equal(estimates.at(-1)?.withinLimit, false);
});

test("transit stays outside the road-routing provider contract", () => {
  assert.equal(isRoadRoutableMode("transit"), false);
  assert.equal(isRoadRoutableMode("teleport"), false);
  assert.equal(isRoadRoutableMode("bike"), true);
});

test("the routing adapter normalizes provider units and GeoJSON", async () => {
  const requestedUrls: string[] = [];
  const fetchMock: typeof fetch = async (input) => {
    requestedUrls.push(String(input));
    return new Response(JSON.stringify({
      code: "Ok",
      routes: [{
        distance: 3218.688,
        duration: 720,
        geometry: {
          type: "LineString",
          coordinates: [
            [-121.8811, 37.3352],
            [-121.9, 37.35],
            [-121.9227, 37.3746],
          ],
        },
      }],
    }), { status: 200 });
  };

  const route = await getRoadRoute(
    downtownSanJose,
    northSanJose,
    "bike",
    "test-token",
    fetchMock,
  );

  assert.equal(route.distanceMiles, 2);
  assert.equal(route.durationMinutes, 12);
  assert.equal(route.geometry.coordinates.length, 3);
  assert.match(requestedUrls[0], /mapbox\/cycling/);
});

test("ride-share routing adds pickup time to the driving route", async () => {
  const fetchMock: typeof fetch = async () => new Response(JSON.stringify({
    code: "Ok",
    routes: [{
      distance: 1609.344,
      duration: 300,
      geometry: {
        type: "LineString",
        coordinates: [
          [-121.8811, 37.3352],
          [-121.9227, 37.3746],
        ],
      },
    }],
  }), { status: 200 });

  const route = await getRoadRoute(
    downtownSanJose,
    northSanJose,
    "ride share",
    "test-token",
    fetchMock,
  );

  assert.equal(route.durationMinutes, 12);
});

test("free street routing uses distinct pedestrian, bicycle, and car networks", async () => {
  const { getOpenStreetMapRoute } = await import("../features/commute/routing");
  for (const [mode, profile] of [["walk", "foot"], ["bike", "bike"], ["drive", "car"], ["ride share", "car"]] as const) {
    let url = "";
    const route = await getOpenStreetMapRoute(downtownSanJose, northSanJose, mode, "https://unitern.example", async (input, init) => {
      url = String(input);
      assert.match(new Headers(init?.headers).get("User-Agent") ?? "", /Unitern/);
      assert.ok(init?.signal);
      return Response.json({ code: "Ok", routes: [{ distance: 1609.344, duration: 600, geometry: { type: "LineString", coordinates: [[-121.88, 37.33], [-121.92, 37.37]] } }] });
    });
    assert.match(url, new RegExp(`routed-${profile}/`));
    assert.equal(route.provider, "osrm");
    assert.equal(route.distanceMiles, 1);
    assert.equal(route.durationMinutes, mode === "ride share" ? 17 : 10);
  }
});

test("street routing rejects invalid provider routes instead of displaying made-up times", async () => {
  const { getOpenStreetMapRoute } = await import("../features/commute/routing");
  await assert.rejects(getOpenStreetMapRoute(downtownSanJose, northSanJose, "walk", "https://unitern.example", async () => Response.json({ code: "Ok", routes: [{ distance: -1, duration: -60 }] })), /unavailable/);
});

test("commute matches honor road times, selected modes, and changes to the slider", async () => {
  const { compareHomeCommutes } = await import("../features/commute/matches");
  const homes = [{ id: 1, coordinates: downtownSanJose }, { id: 2, coordinates: northSanJose }] as import("../features/listings/types").Listing[];
  const geometry = { type: "LineString" as const, coordinates: [[-121.88, 37.33], [-121.92, 37.37]] as [number, number][] };
  const routes = { 1: [{ mode: "bike" as const, durationMinutes: 8, distanceMiles: 1, geometry, provider: "osrm" as const }], 2: [{ mode: "bike" as const, durationMinutes: 45, distanceMiles: 5, geometry, provider: "osrm" as const }] };
  const tight = compareHomeCommutes(homes, northSanJose, ["bike"], 10, routes);
  assert.deepEqual(tight.filter((match) => match.withinLimit).map((match) => match.listing.id), [1]);
  assert.equal(compareHomeCommutes(homes, northSanJose, ["bike"], 60, routes).filter((match) => match.withinLimit).length, 2);
  assert.equal(compareHomeCommutes(homes, northSanJose, ["walk"], 60, routes)[0].fastest.routed, false);
});
