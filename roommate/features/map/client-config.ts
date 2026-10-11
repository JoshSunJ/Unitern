"use client";

import { getVersion, setWorkerUrl } from "maplibre-gl";

// MapLibre 6 ships its worker separately. The versioned same-origin asset is
// prepared before dev/build, including the standalone production image.
setWorkerUrl(`/maplibre/${getVersion()}/maplibre-gl-worker.mjs`);

export { mapStyle } from "./config";
