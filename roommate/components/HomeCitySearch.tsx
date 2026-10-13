"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import LocationSearch from "@/components/LocationSearch";
import type { CityPreference } from "@/features/location-search/city-preference";
import { cityChoices } from "@/features/location-search/catalog";

type Props = { city: CityPreference; navigateToListings?: boolean };

export default function HomeCitySearch({ city, navigateToListings = true }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [searchOther, setSearchOther] = useState(false);
  const matchingChoice = cityChoices.find((choice) => choice.shortLabel === city.shortLabel);

  async function selectCity(nextCity: CityPreference) {
    setStatus("saving");
    try {
      const response = await fetch("/api/city-preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextCity),
      });

      if (!response.ok) {
        setStatus("error");
        return;
      }

      setStatus("idle");
      if (navigateToListings) router.replace("/#listings");
      router.refresh();
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="home-city-search">
      <label className="city-select-label">
        <span>Choose your city</span>
        <select aria-label="Choose your city" disabled={status === "saving"} value={searchOther ? "other" : matchingChoice?.id ?? "current"} onChange={(event) => {
          if (event.target.value === "other") { setSearchOther(true); return; }
          const nextCity = cityChoices.find((choice) => choice.id === event.target.value);
          if (nextCity) { setSearchOther(false); void selectCity(nextCity); }
        }}>
          {!matchingChoice && <option value="current">{city.shortLabel}</option>}
          {cityChoices.map((choice) => <option key={choice.id} value={choice.id}>{choice.shortLabel}, CA</option>)}
          <option value="other">Search another US city…</option>
        </select>
      </label>
      {searchOther && <LocationSearch
        key={city.id}
        kind="city"
        label="Find another city"
        placeholder="Search any US city…"
        value={city.label}
        onSelect={selectCity}
      />}
      <p role="status">
        {status === "saving"
          ? "Updating your city…"
          : status === "error"
            ? "We could not save that city. Try again."
            : `Showing housing around ${city.shortLabel}.`}
      </p>
    </div>
  );
}
