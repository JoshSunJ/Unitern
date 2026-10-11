"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import Map, {
  Layer,
  Marker,
  NavigationControl,
  Popup,
  Source,
  type MapRef,
} from "react-map-gl/maplibre";

import { mapStyle } from "@/features/map/client-config";
import type { CommuteRoute } from "@/features/commute/types";
import type { Coordinates, Listing } from "@/features/listings/types";
import type { Place } from "@/features/places/types";

type Props = {
  places: Place[];
  highlightedPlaceId: string;
  savedListings: Listing[];
  selectedHomeId: number | null;
  onSelectSavedHome: (listingId: number) => void;
  focusCoordinates: Coordinates;
  roadRoute: CommuteRoute | null;
};

type SelectedMarker =
  | { kind: "place"; id: string }
  | { kind: "listing"; id: number }
  | null;

export default function MapInner({
  places,
  highlightedPlaceId,
  savedListings,
  selectedHomeId,
  onSelectSavedHome,
  focusCoordinates,
  roadRoute,
}: Props) {
  const mapRef = useRef<MapRef>(null);
  const [mapReady, setMapReady] = useState(false);
  const [selectedMarker, setSelectedMarker] = useState<SelectedMarker>(null);
  const highlightedPlace = useMemo(
    () => places.find((place) => place.id === highlightedPlaceId) ?? places[0],
    [highlightedPlaceId, places],
  );
  const selectedPlace = selectedMarker?.kind === "place"
    ? places.find((place) => place.id === selectedMarker.id)
    : undefined;
  const selectedListing = selectedMarker?.kind === "listing"
    ? savedListings.find((listing) => listing.id === selectedMarker.id)
    : undefined;
  const commuteHome = selectedHomeId === null
    ? undefined
    : savedListings.find((listing) => listing.id === selectedHomeId);
  const commuteLine = useMemo(() => {
    if (!commuteHome?.coordinates || !highlightedPlace) return null;

    return roadRoute ? {
      type: "Feature" as const,
      properties: { source: "road-route" },
      geometry: roadRoute.geometry,
    } : {
      type: "Feature" as const,
      properties: { source: "estimate" },
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [commuteHome.coordinates.longitude, commuteHome.coordinates.latitude],
          [highlightedPlace.coordinates.longitude, highlightedPlace.coordinates.latitude],
        ],
      },
    };
  }, [commuteHome, highlightedPlace, roadRoute]);

  useEffect(() => {
    if (!mapReady) return;
    if (commuteHome?.coordinates && highlightedPlace) {
      mapRef.current?.fitBounds(
        [
          [commuteHome.coordinates.longitude, commuteHome.coordinates.latitude],
          [highlightedPlace.coordinates.longitude, highlightedPlace.coordinates.latitude],
        ],
        { padding: 100, maxZoom: 14, duration: 800 },
      );
      return;
    }
    const target = highlightedPlace?.coordinates ?? focusCoordinates;
    mapRef.current?.flyTo({
      center: [
        target.longitude,
        target.latitude,
      ],
      zoom: highlightedPlace ? 13.5 : 10.5,
      duration: 800,
    });
  }, [commuteHome, focusCoordinates, highlightedPlace, mapReady]);

  return (
    <div className="location-map">
      <Map
        ref={mapRef}
        initialViewState={{ longitude: focusCoordinates.longitude, latitude: focusCoordinates.latitude, zoom: 12.5 }}
        mapStyle={mapStyle}
        reuseMaps
        onLoad={() => setMapReady(true)}
        onStyleData={() => setMapReady(true)}
        onClick={() => setSelectedMarker(null)}
        aria-label="Area map showing destinations and saved homes"
      >
        <NavigationControl position="top-right" showCompass={false} />

        {commuteLine && (
          <Source id="commute-preview" type="geojson" data={commuteLine}>
            <Layer
              id="commute-preview-line"
              type="line"
              paint={{
                "line-color": "#d5ff52",
                "line-width": 5,
                "line-opacity": 0.9,
                ...(roadRoute ? {} : { "line-dasharray": [1.4, 1.2] }),
              }}
            />
          </Source>
        )}

        {places.map((place) => {
          const isDestination = place.id === highlightedPlaceId;
          return (
            <Marker
              key={place.id}
              longitude={place.coordinates.longitude}
              latitude={place.coordinates.latitude}
              anchor="bottom"
              onClick={(event) => {
                event.originalEvent.stopPropagation();
                setSelectedMarker({ kind: "place", id: place.id });
              }}
            >
              <button
                type="button"
                className={`area-marker area-marker--${place.category.toLowerCase()}${isDestination ? " area-marker--destination" : ""}`}
                aria-label={`${place.name}, ${place.category}`}
              >
                {isDestination ? (
                  <Image
                    src="/flag.png"
                    alt=""
                    width={52}
                    height={52}
                    className="area-marker__flag"
                  />
                ) : place.category.slice(0, 1)}
              </button>
            </Marker>
          );
        })}

        {savedListings.flatMap((listing) => listing.coordinates ? [(
          <Marker
            key={`saved-listing-${listing.id}`}
            longitude={listing.coordinates.longitude}
            latitude={listing.coordinates.latitude}
            anchor="bottom"
              onClick={(event) => {
                event.originalEvent.stopPropagation();
                setSelectedMarker({ kind: "listing", id: listing.id });
                onSelectSavedHome(listing.id);
              }}
            >
            <button type="button" className={`area-marker area-marker--saved${selectedHomeId === listing.id ? " area-marker--selected-home" : ""}`} aria-label={`Saved home: ${listing.title}`}>
              ♥
            </button>
          </Marker>
        )] : [])}

        {selectedPlace && (
          <Popup
            longitude={selectedPlace.coordinates.longitude}
            latitude={selectedPlace.coordinates.latitude}
            anchor="bottom"
            offset={18}
            closeOnClick={false}
            onClose={() => setSelectedMarker(null)}
          >
            <article className="area-popup">
              <p>{selectedPlace.category}</p>
              <h3>{selectedPlace.name}</h3>
              <span>{selectedPlace.description}</span>
            </article>
          </Popup>
        )}

        {selectedListing?.coordinates && (
          <Popup
            longitude={selectedListing.coordinates.longitude}
            latitude={selectedListing.coordinates.latitude}
            anchor="bottom"
            offset={18}
            closeOnClick={false}
            onClose={() => setSelectedMarker(null)}
          >
            <article className="area-popup">
              <p>Saved home</p>
              <h3>{selectedListing.title}</h3>
              <span>${selectedListing.rent}/month</span>
              <Link href={`/listings/${selectedListing.id}`}>View home ↗</Link>
            </article>
          </Popup>
        )}
      </Map>

      <div className="area-map-legend">
        <span><i className="legend-destination" />Destination</span>
        <span><i className="legend-home" />Saved home</span>
        {roadRoute && <span><i className="legend-route" />{roadRoute.mode} route</span>}
      </div>
    </div>
  );
}
