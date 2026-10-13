import type {
  CommuteEstimate,
  CommuteRoute,
} from "@/features/commute/types";

type Props = {
  estimates: CommuteEstimate[];
  roadRoutes: CommuteRoute[];
  hasHome: boolean;
  hasDestination: boolean;
  maxCommuteMinutes: number;
  routesLoading: boolean;
  routesUnavailable: boolean;
};

export default function CommuteComparison({
  estimates,
  roadRoutes,
  hasHome,
  hasDestination,
  maxCommuteMinutes,
  routesLoading,
  routesUnavailable,
}: Props) {
  if (!hasHome || !hasDestination) {
    return (
      <div className="commute-comparison commute-comparison--empty">
        <p className="eyebrow">Commute preview</p>
        <strong>
          {!hasHome
            ? "Choose an available home to compare."
            : "Search for a campus or workplace to compare."}
        </strong>
      </div>
    );
  }

  return (
    <section className="commute-comparison" aria-labelledby="commute-comparison-title">
      <div className="commute-comparison__heading">
        <div>
          <p className="eyebrow">Commute preview</p>
          <h3 id="commute-comparison-title">Compare your selected modes</h3>
        </div>
        <span>Planning estimate</span>
      </div>

      <div className="commute-estimate-list">
        {[...estimates].sort((a, b) => (roadRoutes.find((route) => route.mode === a.mode)?.durationMinutes ?? a.durationMinutes) - (roadRoutes.find((route) => route.mode === b.mode)?.durationMinutes ?? b.durationMinutes)).map((estimate) => {
          const roadRoute = roadRoutes.find((route) => route.mode === estimate.mode);
          const distanceMiles = roadRoute?.distanceMiles ?? estimate.distanceMiles;
          const durationMinutes = roadRoute?.durationMinutes ?? estimate.durationMinutes;
          const withinLimit = durationMinutes <= maxCommuteMinutes;

          return (
            <article
              key={estimate.mode}
              className={withinLimit ? "is-within-limit" : "is-over-limit"}
            >
              <div>
                <strong>{estimate.mode}</strong>
                <span>{distanceMiles.toFixed(1)} {roadRoute ? "road" : "estimated"} miles</span>
              </div>
              <b>{durationMinutes} min</b>
              <small>{withinLimit ? "Within your limit" : "Over your limit"}</small>
              <em>{roadRoute ? "Street route" : "Approximate estimate"}</em>
            </article>
          );
        })}
      </div>

      <p className="commute-comparison__status" aria-live="polite">
        {routesLoading
          ? "Calculating road routes…"
          : routesUnavailable
            ? "Road routing is unavailable; estimates remain visible."
            : roadRoutes.length > 0
              ? "Road geometry is active for supported modes."
              : "Transit currently uses a planning estimate."}
      </p>

      <p className="commute-comparison__disclaimer">
        Street times exclude live traffic, parking and delays. Transit is approximate, based on distance and typical speeds, without schedules. Dashed map lines show direct distance only.
      </p>
      {roadRoutes.some((route) => route.provider === "osrm") && <p className="commute-routing-credit">Routes: <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noreferrer">FOSSGIS / OSRM</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">Fix the map</a></p>}
    </section>
  );
}
