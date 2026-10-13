"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { campusChoices, cityChoices } from "@/features/location-search/catalog";
import { compareHomeCommutes } from "@/features/commute/matches";

import CommuteComparison from "@/components/CommuteComparison";
import LocationMap from "@/components/LocationMap";
import LocationSearch from "@/components/LocationSearch";
import { requestRoadRoutes } from "@/features/commute/client";
import { compareCommuteModes } from "@/features/commute/service";
import type { CommuteRoute } from "@/features/commute/types";
import type { Listing } from "@/features/listings/types";
import {
  isInCityArea,
  type CityPreference,
} from "@/features/location-search/city-preference";
import type { LocationSearchResult } from "@/features/location-search/types";
import type { Place, PlaceCategory } from "@/features/places/types";
import type { CommuteMode } from "@/features/preferences/types";

type Props = {
  places: Place[];
  listings: Listing[];
  savedListingIds: number[];
  initialCampusId?: string;
  city: CityPreference;
};

type RoadRouteResult = {
  requestKey: string;
  routes: CommuteRoute[];
  unavailable: boolean;
};

const commuteModes: CommuteMode[] = ["transit", "drive", "bike", "walk", "ride share"];

function placeAsSearchResult(place: Place): LocationSearchResult {
  return {
    id: place.id,
    label: `${place.name} · ${place.description}`,
    shortLabel: place.name,
    type: "poi",
    coordinates: place.coordinates,
  };
}

export default function MapSelector({ places, listings, savedListingIds, city, initialCampusId }: Props) {
  const router = useRouter();
  const [audience, setAudience] = useState<"student" | "intern">("student");
  const localPlaces = useMemo(() => places.filter((place) => isInCityArea(place.coordinates, city)), [city, places]);
  const localCampuses = useMemo(() => campusChoices.filter((campus) => isInCityArea(campus.coordinates, city)), [city]);
  const [selectedDestination, setSelectedDestination] = useState<LocationSearchResult | null>(
    localCampuses.find((campus) => campus.id === initialCampusId) ?? localCampuses[0] ?? (localPlaces.find((place) => place.category === "Campus") ? placeAsSearchResult(localPlaces.find((place) => place.category === "Campus")!) : null),
  );
  const [searchRevision, setSearchRevision] = useState(0);
  const [cityStatus, setCityStatus] = useState("");
  const [selectedModes, setSelectedModes] = useState<CommuteMode[]>(["transit", "bike"]);
  const [maxCommuteMinutes, setMaxCommuteMinutes] = useState(30);
  const [roadResults, setRoadResults] = useState<Record<number, RoadRouteResult>>({});
  const visibleListings = useMemo(() => listings.filter((listing) => isInCityArea(listing.coordinates, city)), [city, listings]);
  const [selectedHomeId, setSelectedHomeId] = useState<number | null>(visibleListings.find((listing) => savedListingIds.includes(listing.id))?.id ?? visibleListings[0]?.id ?? null);
  const selectedHome = visibleListings.find((listing) => listing.id === selectedHomeId) ?? null;
  const localDestinations = audience === "student" ? localCampuses : localPlaces.filter((place) => place.category === "Company").map(placeAsSearchResult);
  const mapPlaces = useMemo(() => {
    const base = localPlaces.filter((place) => place.category !== "Campus");
    const campuses: Place[] = localCampuses.map((campus) => ({ id: campus.id, name: campus.shortLabel, category: "Campus", coordinates: campus.coordinates, description: campus.label }));
    const all = [...base, ...campuses];
    if (!selectedDestination || all.some((place) => place.id === selectedDestination.id)) return all;
    const category: PlaceCategory = audience === "student" ? "Campus" : "Company";
    return [...all, { id: selectedDestination.id, name: selectedDestination.shortLabel, category, coordinates: selectedDestination.coordinates, description: selectedDestination.label }];
  }, [audience, localCampuses, localPlaces, selectedDestination]);
  const routeRequestKey = selectedDestination
    ? [selectedDestination.coordinates.longitude, selectedDestination.coordinates.latitude, selectedModes.join(","), ...visibleListings.map((home) => `${home.id}:${home.coordinates?.longitude},${home.coordinates?.latitude}`)].join("|")
    : "";
  const routesByHome = Object.fromEntries(visibleListings.map((home) => [home.id, roadResults[home.id]?.requestKey === routeRequestKey ? roadResults[home.id].routes : []]));
  const roadRoutes: CommuteRoute[] = selectedHome ? routesByHome[selectedHome.id] ?? [] : [];
  const matches = selectedDestination ? compareHomeCommutes(visibleListings, selectedDestination.coordinates, selectedModes, maxCommuteMinutes, routesByHome) : [];
  const matchingHomes = matches.filter((match) => match.withinLimit);
  const commuteEstimates = selectedHome?.coordinates && selectedDestination
    ? compareCommuteModes(selectedHome.coordinates, selectedDestination.coordinates, selectedModes, maxCommuteMinutes)
    : [];
  const routeEligible = selectedHome && visibleListings.slice(0, 10).some((home) => home.id === selectedHome.id);
  const routesLoading = Boolean(routeEligible && selectedHome && routeRequestKey && roadResults[selectedHome.id]?.requestKey !== routeRequestKey);
  const routesUnavailable = Boolean(selectedHome && roadResults[selectedHome.id]?.requestKey === routeRequestKey && roadResults[selectedHome.id].unavailable);
  const [displayMode, setDisplayMode] = useState<CommuteMode>("bike");
  const effectiveDisplayMode = selectedModes.includes(displayMode) ? displayMode : selectedModes[0];
  const displayedRoadRoute = roadRoutes.find((route) => route.mode === effectiveDisplayMode) ?? null;

  useEffect(() => {
    if (!routeRequestKey || !selectedDestination) return;
    const controller = new AbortController();
    // A bounded sequential preview prevents a city with many homes from flooding
    // the community routing service. Other homes retain labeled estimates.
    async function calculate() {
      for (const home of visibleListings.slice(0, 10)) {
        if (controller.signal.aborted || !home.coordinates) break;
        try {
          const routes = await requestRoadRoutes({ origin: home.coordinates, destination: selectedDestination!.coordinates, modes: selectedModes, signal: controller.signal });
          if (controller.signal.aborted) break;
          setRoadResults((current) => ({ ...current, [home.id]: { requestKey: routeRequestKey, routes, unavailable: false } }));
        } catch {
          if (controller.signal.aborted) break;
          setRoadResults((current) => ({ ...current, [home.id]: { requestKey: routeRequestKey, routes: [], unavailable: true } }));
        }
      }
    }
    void calculate();
    return () => controller.abort();
  }, [routeRequestKey, selectedDestination, selectedModes, visibleListings]);

  async function chooseDestination(destination: LocationSearchResult) {
    setCityStatus("");
    const nextCity = cityChoices.find((choice) => choice.id === destination.cityId);
    if (nextCity && !isInCityArea(destination.coordinates, city)) {
      setCityStatus(`Switching to ${nextCity.shortLabel}…`);
      try {
        const response = await fetch("/api/city-preference", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(nextCity) });
        if (!response.ok) throw new Error("Could not save city");
        router.replace(`/map?campus=${encodeURIComponent(destination.id)}`);
        router.refresh();
      } catch { setCityStatus(`Could not switch cities. Choose ${nextCity.shortLabel} on the homepage and try again.`); }
    } else { setSelectedDestination(destination); }
  }

  function toggleMode(mode: CommuteMode) {
    setDisplayMode(mode);
    setSelectedModes((current) =>
      current.includes(mode)
        ? current.length > 1 ? current.filter((item) => item !== mode) : current
        : [...current, mode],
    );
  }

  function changeAudience(option: "student" | "intern") {
    setAudience(option);
    const nextDestination = option === "student" ? localCampuses[0] : localPlaces.find((place) => place.category === "Company");
    setSelectedDestination(nextDestination ? ("shortLabel" in nextDestination ? nextDestination : placeAsSearchResult(nextDestination)) : null);
    setDisplayMode(option === "student" ? "bike" : "drive");
    setSelectedModes(option === "student" ? ["transit", "bike"] : ["transit", "drive"]);
  }

  return (
    <section className="map-experience" aria-label="Personalized area guide">
      <aside className="map-preference-panel">
        <div className="routine-heading">
          <p className="eyebrow">Your routine</p>
          <h2>What brings you here?</h2>
        </div>

        <div className="routine-switch" aria-label="Choose student or intern routine">
          {(["student", "intern"] as const).map((option) => (
            <button
              type="button"
              key={option}
              className={audience === option ? "is-active" : ""}
              aria-pressed={audience === option}
              onClick={() => changeAudience(option)}
            >
              {option === "student" ? "University student" : "Company intern"}
            </button>
          ))}
        </div>

        <LocationSearch
          key={`${audience}-${city.id}-${searchRevision}`}
          kind="destination"
          label={audience === "student" ? "University or campus" : "Company or workplace"}
          placeholder={audience === "student" ? "Search universities…" : "Search employers…"}
          value={selectedDestination?.label ?? ""}
          proximity={city.coordinates}
          boundingBox={city.boundingBox}
          onInputChange={() => setSelectedDestination(null)}
          onSelect={chooseDestination}
        />

        <p className="commute-search-hint" role="status">{cityStatus || `Search in ${city.shortLabel}, or enter a campus shortcut such as UCLA or SJSU to switch cities.`}</p>

        {localDestinations.length > 0 && (
          <div className="destination-quick-picks" aria-label="Suggested destinations">
            <span>Quick picks</span>
            <div>
              {localDestinations.map((place) => (
                <button
                  type="button"
                  key={place.id}
                  className={selectedDestination?.id === place.id ? "is-active" : ""}
                  onClick={() => { setSearchRevision((current) => current + 1); void chooseDestination(place); }}
                >
                  {place.shortLabel}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="saved-home-picker" htmlFor="saved-home">
          <span>Home to compare</span>
          <select
            id="saved-home"
            value={selectedHomeId ?? ""}
            onChange={(event) => setSelectedHomeId(
              event.target.value ? Number(event.target.value) : null,
            )}
          >
            <option value="">Choose an available home</option>
            {visibleListings.map((listing) => (
              <option key={listing.id} value={listing.id}>
                {savedListingIds.includes(listing.id) ? "Saved · " : ""}{listing.title} · ${listing.rent}/month
              </option>
            ))}
          </select>
        </label>

        <fieldset className="commute-mode-picker">
          <legend>How would you travel?</legend>
          <div>
            {commuteModes.map((mode) => (
              <button
                type="button"
                key={mode}
                className={selectedModes.includes(mode) ? "is-active" : ""}
                aria-pressed={selectedModes.includes(mode)}
                onClick={() => toggleMode(mode)}
              >
                {mode}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="commute-limit" htmlFor="commute-limit">
          <span>Maximum commute <strong>{maxCommuteMinutes} min</strong></span>
          <input
            id="commute-limit"
            type="range"
            min="10"
            max="90"
            step="5"
            value={maxCommuteMinutes}
            onChange={(event) => setMaxCommuteMinutes(Number(event.target.value))}
          />
        </label>

        {selectedDestination && <section className="commute-matches" aria-label="Homes matching your commute">
          <h3 aria-live="polite">{matchingHomes.length} of {matches.length} homes within {maxCommuteMinutes} min</h3>
          <p>At least one of your selected travel modes must fit. Times update as street routes arrive.</p>
          {matchingHomes.map(({ listing, fastest }) => <button key={listing.id} type="button" aria-pressed={selectedHomeId === listing.id} onClick={() => { setSelectedHomeId(listing.id); setDisplayMode(fastest.mode); }}>
            <strong>{listing.title}</strong><span>{fastest.durationMinutes} min · {fastest.mode} · {fastest.routed ? "street route" : "approximate"}</span>
          </button>)}
          {matches.length > 0 && matchingHomes.length === 0 && <p>No homes fit yet. Increase the limit or add another travel mode.</p>}
          {matches.length === 0 && <p>No mapped homes in this city yet. <Link href="/#listings">Choose another city</Link>.</p>}
        </section>}

        <div className="commute-summary">
          <span>City</span>
          <strong>{city.shortLabel}</strong>
          <span>Routine</span>
          <strong>{audience}</strong>
          <span>Preferred</span>
          <strong>{selectedModes.join(" + ")}</strong>
        </div>

        <CommuteComparison
          estimates={commuteEstimates}
          roadRoutes={roadRoutes}
          hasHome={Boolean(selectedHome?.coordinates)}
          hasDestination={Boolean(selectedDestination)}
          maxCommuteMinutes={maxCommuteMinutes}
          routesLoading={routesLoading}
          routesUnavailable={routesUnavailable}
        />

        {selectedHome && <label className="saved-home-picker">Route shown on map
          <select value={selectedModes.includes(displayMode) ? displayMode : selectedModes[0]} onChange={(event) => setDisplayMode(event.target.value as CommuteMode)}>
            {selectedModes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
          </select>
        </label>}

        <div className="area-place-list" aria-label={`Places in ${city.shortLabel}`}>
          <div>
            <p className="eyebrow">Places in {city.shortLabel}</p>
            <span>{mapPlaces.length} places</span>
          </div>
          {mapPlaces.map((place) => (
            <article key={place.id} className={place.id === selectedDestination?.id ? "is-highlighted" : ""}>
              <i aria-hidden="true">{place.category.slice(0, 1)}</i>
              <div><strong>{place.name}</strong><span>{place.category} · {place.description}</span></div>
            </article>
          ))}
          {mapPlaces.length === 0 && <p className="area-place-list__empty">Search for a destination to start your city routine.</p>}
        </div>
      </aside>

      <LocationMap
        places={mapPlaces}
        highlightedPlaceId={selectedDestination?.id ?? ""}
        savedListings={selectedDestination ? visibleListings.filter((home) => matchingHomes.some((match) => match.listing.id === home.id) || home.id === selectedHomeId) : visibleListings}
        selectedHomeId={selectedHomeId}
        onSelectSavedHome={setSelectedHomeId}
        focusCoordinates={selectedDestination?.coordinates ?? city.coordinates}
        roadRoute={displayedRoadRoute}
      />
    </section>
  );
}
