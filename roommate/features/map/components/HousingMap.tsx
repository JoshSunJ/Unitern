"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import Map, {
  Marker,
  NavigationControl,
  Popup,
  type MapRef,
} from "react-map-gl/maplibre";

import { mapStyle } from "@/features/map/client-config";
import {
  toListingFeatureCollection,
  type ListingMapProperties,
} from "@/features/map/listing-geojson";
import type { Coordinates, Listing } from "@/features/listings/types";

type Props = {
  listings: Listing[];
  savedListingIds: number[];
  selectedListingId?: number | null;
  onSelectListing?: (listingId: number | null) => void;
  focusCoordinates: Coordinates;
};

type SelectedListing = ListingMapProperties & {
  longitude: number;
  latitude: number;
};

export default function HousingMap({
  listings,
  savedListingIds,
  selectedListingId = null,
  onSelectListing,
  focusCoordinates,
}: Props) {
  const mapRef = useRef<MapRef>(null);
  const [mapState, setMapState] = useState<"loading" | "ready" | "error">("loading");
  const listingData = useMemo(
    () => toListingFeatureCollection(listings, savedListingIds),
    [listings, savedListingIds],
  );
  const selectedListing = useMemo<SelectedListing | null>(() => {
    const feature = listingData.features.find(
      ({ properties }) => properties.id === selectedListingId,
    );

    if (!feature) return null;

    const [longitude, latitude] = feature.geometry.coordinates;
    return { ...feature.properties, longitude, latitude };
  }, [listingData, selectedListingId]);

  useEffect(() => {
    if (mapState !== "loading") return;

    const timeout = window.setTimeout(() => setMapState("error"), 8_000);
    return () => window.clearTimeout(timeout);
  }, [mapState]);

  useEffect(() => {
    if (mapState !== "ready" || listingData.features.length === 0) return;

    const coordinates = listingData.features.map(({ geometry }) => geometry.coordinates);

    if (coordinates.length === 1) {
      const [longitude, latitude] = coordinates[0];
      mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 14, duration: 600 });
      return;
    }

    const longitudes = coordinates.map(([longitude]) => longitude);
    const latitudes = coordinates.map(([, latitude]) => latitude);

    mapRef.current?.fitBounds(
      [
        [Math.min(...longitudes), Math.min(...latitudes)],
        [Math.max(...longitudes), Math.max(...latitudes)],
      ],
      { padding: 64, maxZoom: 14, duration: 600 },
    );
  }, [listingData, mapState]);

  useEffect(() => {
    if (mapState !== "ready" || listingData.features.length > 0) return;

    mapRef.current?.flyTo({
      center: [focusCoordinates.longitude, focusCoordinates.latitude],
      zoom: 11.5,
      duration: 600,
    });
  }, [focusCoordinates, listingData.features.length, mapState]);

  useEffect(() => {
    if (!selectedListing || mapState !== "ready") return;

    mapRef.current?.flyTo({
      center: [selectedListing.longitude, selectedListing.latitude],
      zoom: Math.max(mapRef.current?.getZoom() ?? 13, 13.5),
      duration: 500,
    });
  }, [mapState, selectedListing]);

  return (
    <div
      className="housing-map-shell"
      data-map-state={mapState}
      data-feature-count={listingData.features.length}
      aria-busy={mapState === "loading"}
    >
      <Map
        ref={mapRef}
        initialViewState={{ longitude: focusCoordinates.longitude, latitude: focusCoordinates.latitude, zoom: 11.5 }}
        mapStyle={mapStyle}
        onClick={() => onSelectListing?.(null)}
        onLoad={() => setMapState("ready")}
        onStyleData={() => setMapState("ready")}
        reuseMaps
        aria-label="Map of available housing listings"
      >
        <NavigationControl position="top-right" showCompass={false} />

        {listingData.features.map((feature) => {
          const [longitude, latitude] = feature.geometry.coordinates;
          const listing = feature.properties;

          return (
            <Marker
              key={listing.id}
              longitude={longitude}
              latitude={latitude}
              anchor="bottom"
              onClick={(event) => {
                event.originalEvent.stopPropagation();
                onSelectListing?.(listing.id);
              }}
            >
              <button
                type="button"
                className={`housing-map-marker${listing.isSaved ? " housing-map-marker--saved" : ""}${selectedListingId === listing.id ? " housing-map-marker--selected" : ""}`}
                aria-pressed={selectedListingId === listing.id}
                aria-label={`Open ${listing.title}, $${listing.rent} per month`}
              >
                {listing.isSaved ? "♥" : `$${listing.rent}`}
              </button>
            </Marker>
          );
        })}

        {selectedListing && (
          <Popup
            longitude={selectedListing.longitude}
            latitude={selectedListing.latitude}
            anchor="bottom"
            offset={16}
            closeOnClick={false}
            onClose={() => onSelectListing?.(null)}
          >
            <article className="housing-map-popup">
              <p>{selectedListing.isSaved ? "Saved home" : "Available home"}</p>
              <h3>{selectedListing.title}</h3>
              <span>{selectedListing.location}</span>
              <strong>${selectedListing.rent}/month · {selectedListing.bedrooms} bed</strong>
              <Link href={`/listings/${selectedListing.id}`}>View listing ↗</Link>
            </article>
          </Popup>
        )}
      </Map>

      {mapState === "error" && (
        <p className="housing-map-error" role="status">
          The map style could not load. The housing cards are still available.
        </p>
      )}

      <div className="housing-map-legend" aria-label="Map legend">
        <span><i className="housing-map-legend__available" />Available</span>
        <span><i className="housing-map-legend__saved" />Saved</span>
      </div>
    </div>
  );
}
