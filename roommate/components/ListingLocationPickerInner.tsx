"use client";

import { useEffect, useRef } from "react";
import Map, { Marker, NavigationControl, type MapRef } from "react-map-gl/maplibre";

import { mapStyle } from "@/features/map/client-config";
import type { Coordinates } from "@/features/listings/types";

type Props = {
  value: Coordinates | null;
  onChange: (coordinates: Coordinates) => void;
};

const sanJoseCenter = { latitude: 37.3352, longitude: -121.8811 };

export default function ListingLocationPickerInner({ value, onChange }: Props) {
  const mapRef = useRef<MapRef>(null);

  useEffect(() => {
    if (!value) return;
    mapRef.current?.flyTo({
      center: [value.longitude, value.latitude],
      zoom: 14,
      duration: 500,
    });
  }, [value]);

  return (
    <div className="listing-location-map">
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: value?.longitude ?? sanJoseCenter.longitude,
          latitude: value?.latitude ?? sanJoseCenter.latitude,
          zoom: 12.5,
        }}
        mapStyle={mapStyle}
        reuseMaps
        cursor="crosshair"
        onClick={(event) => onChange({
          latitude: event.lngLat.lat,
          longitude: event.lngLat.lng,
        })}
        aria-label="Choose an approximate listing location"
      >
        <NavigationControl position="top-right" showCompass={false} />
        {value && (
          <Marker
            longitude={value.longitude}
            latitude={value.latitude}
            anchor="bottom"
            draggable
            onDragEnd={(event) => onChange({
              latitude: event.lngLat.lat,
              longitude: event.lngLat.lng,
            })}
          >
            <span className="location-picker-pin" aria-label="Selected listing location">◆</span>
          </Marker>
        )}
      </Map>
      <p className="location-picker-hint">Click the map to place the pin. Drag it to make a small adjustment.</p>
    </div>
  );
}
