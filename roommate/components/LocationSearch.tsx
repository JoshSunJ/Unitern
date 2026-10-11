"use client";

import { useEffect, useId, useRef, useState } from "react";

import type {
  LocationSearchKind,
  LocationSearchResult,
} from "@/features/location-search/types";
import type { Coordinates } from "@/features/listings/types";

type Props = {
  kind: LocationSearchKind;
  label: string;
  placeholder: string;
  onSelect: (result: LocationSearchResult) => void;
  onInputChange?: () => void;
  proximity?: Coordinates;
  boundingBox?: [number, number, number, number];
  value?: string;
  name?: string;
  required?: boolean;
};

export default function LocationSearch({
  kind,
  label,
  placeholder,
  onSelect,
  onInputChange,
  proximity,
  boundingBox,
  value = "",
  name,
  required = false,
}: Props) {
  const inputId = useId();
  const [query, setQuery] = useState(value);
  const [selectedLabel, setSelectedLabel] = useState(value);
  const [results, setResults] = useState<LocationSearchResult[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const requestNumber = useRef(0);
  const latitude = proximity?.latitude;
  const longitude = proximity?.longitude;
  const bounds = boundingBox?.join(",");

  function selectResult(result: LocationSearchResult) {
    requestNumber.current++;
    setQuery(result.label);
    setSelectedLabel(result.label);
    setResults([]);
    setStatus("idle");
    setMessage("");
    setActiveIndex(-1);
    onSelect(result);
  }

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2 || trimmedQuery === selectedLabel) {
      return;
    }

    const controller = new AbortController();
    const currentRequest = ++requestNumber.current;
    const timeout = window.setTimeout(async () => {
      setStatus("loading");
      setMessage("");

      const params = new URLSearchParams({ q: trimmedQuery, kind });
      if (latitude !== undefined && longitude !== undefined) {
        params.set("latitude", String(latitude));
        params.set("longitude", String(longitude));
      }
      if (bounds) {
        params.set("bbox", bounds);
      }

      try {
        const response = await fetch(`/api/location-search?${params}`, {
          signal: controller.signal,
        });
        const body = await response.json();
        if (currentRequest !== requestNumber.current) return;

        if (!response.ok) {
          setResults([]);
          setStatus("error");
          setMessage(body.error ?? "Could not search locations.");
          return;
        }

        setResults(body.results ?? []);
        setActiveIndex(-1);
        setStatus("idle");
        setMessage(body.results?.length ? "" : "No locations found.");
      } catch {
        if (controller.signal.aborted) return;
        setResults([]);
        setStatus("error");
        setMessage("Could not search locations. Please check your connection and try again.");
      }
    }, 320);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [bounds, kind, latitude, longitude, query, selectedLabel]);

  return (
    <div className="location-search">
      <label htmlFor={inputId}>{label}</label>
      <div className="location-search__field">
        <span aria-hidden="true">⌕</span>
        <input
          id={inputId}
          name={name}
          required={required}
          value={query}
          onChange={(event) => {
            const nextQuery = event.target.value;
            requestNumber.current++;
            setQuery(nextQuery);
            setSelectedLabel("");
            setResults([]);
            setActiveIndex(-1);
            setStatus("idle");
            setMessage("");
            onInputChange?.();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              requestNumber.current++;
              setResults([]);
              setActiveIndex(-1);
              setStatus("idle");
            } else if (results.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
              event.preventDefault();
              setActiveIndex((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length);
            } else if (event.key === "Enter" && activeIndex >= 0 && results[activeIndex]) {
              event.preventDefault();
              selectResult(results[activeIndex]);
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={results.length > 0}
          aria-controls={`${inputId}-results`}
          aria-activedescendant={activeIndex >= 0 ? `${inputId}-option-${activeIndex}` : undefined}
        />
        {status === "loading" && <small>Searching…</small>}
      </div>

      {results.length > 0 && (
        <ul id={`${inputId}-results`} className="location-search__results" role="listbox" aria-label={`${label} suggestions`}>
          {results.map((result, index) => (
            <li key={result.id} id={`${inputId}-option-${index}`} role="option" aria-selected={activeIndex === index}>
              <button
                type="button"
                onClick={() => selectResult(result)}
              >
                <strong>{result.shortLabel}</strong>
                <span>{result.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {message && <p className="location-search__message" role="status">{message}</p>}
    </div>
  );
}
