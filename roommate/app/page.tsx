import Link from "next/link";

import Navbar from "@/components/Navbar";
import HomeMotion from "@/components/HomeMotion";
import HomeCitySearch from "@/components/HomeCitySearch";
import ListingFilters from "@/components/ListingFilters";
import ListingWorkspace from "@/components/ListingWorkspace";
import { getListings } from "@/features/listings/service";
import { getCityPreference } from "@/features/location-search/server";
import type { ListingFilters as ListingFiltersType } from "@/features/listings/types";
import { getSavedItemIds } from "@/features/saved-items/service";
import { getCurrentUser } from "@/lib/current-user";

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

// the page validates numeric values before calling the service:
function toOptionalPositiveNumber(value: string | string[] | undefined) {
  if (typeof value !== "string") return undefined;

  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

export default async function Home({ searchParams }: PageProps) {
  const query = await searchParams;
  const city = await getCityPreference();
  const filters: ListingFiltersType = {
    maxRent: toOptionalPositiveNumber(query.maxRent),
    location: typeof query.location === "string" ? query.location : undefined,
    minBedrooms: toOptionalPositiveNumber(query.minBedrooms),
    city,
  };

  const [listings, currentUser] = await Promise.all([
    getListings(filters),
    getCurrentUser(),
  ]);
  const locations = [...new Set(listings.map((listing) => listing.location))].sort();
  const savedListingIds = currentUser
    ? (await getSavedItemIds(currentUser.id)).listingIds
    : [];
  const requestedListingId = toOptionalPositiveNumber(query.listing);
  const initialSelectedListingId = listings.some(
    (listing) => listing.id === requestedListingId && listing.coordinates,
  )
    ? requestedListingId
    : undefined;

  return (
    <>
      <Navbar />
      <HomeMotion>
        <main className="page-shell home-page">
          <section className="hero hero--home" aria-labelledby="home-title">
            <div className="hero-copy">
              <p className="eyebrow">Student & intern living, reimagined</p>
              <h1 id="home-title">Find your place.<br /><em>Make the city yours.</em></h1>
              <p>A home for your next chapter. Find housing and explore the places that make a new city feel like you.</p>
              <div className="hero-actions">
                <a className="button button--primary" href="#listings">Explore homes <span aria-hidden="true">↗</span></a>
                <Link className="button button--quiet" href="/map">Know your route <span aria-hidden="true">→</span></Link>
              </div>
              <p className="hero-note">For university students and interns. Wherever you’re headed.</p>
            </div>
            <div className="home-route" aria-hidden="true">
              <svg viewBox="0 0 1200 280" preserveAspectRatio="none">
                <path className="home-route__track" d="M-50 230 C140 230 155 45 300 45 S390 255 560 200 S645 55 780 65 S1000 230 1250 85" />
                <path className="home-route__draw" pathLength="1" d="M-50 230 C140 230 155 45 300 45 S390 255 560 200 S645 55 780 65 S1000 230 1250 85" />
              </svg>
              <span className="route-place route-place--campus"><span>01</span> Your campus <i>↗</i></span>
              <span className="route-place route-place--home"><span>02</span> Your home <i>⌂</i></span>
              <span className="route-place route-place--work"><span>03</span> Your next big thing <i>✦</i></span>
              <span className="route-caption">a shorter commute. a bigger chapter.</span>
            </div>
          </section>

          <section className="home-introduction" aria-labelledby="intro-title">
            <div className="home-introduction__heading" data-reveal>
              <p className="eyebrow">Made for the move</p>
              <h2 id="intro-title">New city.<br /><em>A little more familiar.</em></h2>
              <p>Your home is just the beginning. Put the rest of your everyday life on the map.</p>
            </div>
            <div className="home-feature-grid">
              <Link href="/#listings" className="home-feature" data-reveal>
                <div className="home-feature__art home-feature__art--homes" aria-hidden="true"><span className="mini-home">⌂</span><span className="mini-label">A place that fits.</span><i>♡</i></div>
                <p className="eyebrow">01 · Find your place</p><h3>A home that feels right.</h3><p>Explore housing by city, budget, and bedrooms. Save the places you want to come back to.</p><span className="home-feature__link">Explore homes ↗</span>
              </Link>
              <Link href="/map" className="home-feature" data-reveal>
                <div className="home-feature__art home-feature__art--routes" aria-hidden="true"><span className="mini-orbit"><i>⌂</i><i>✦</i></span><span className="mini-label">Home → what matters</span></div>
                <p className="eyebrow">02 · Know your route</p><h3>Less guesswork. More living.</h3><p>See your campus, company, and everyday stops. Compare commutes before you make your move.</p><span className="home-feature__link">Explore the area ↗</span>
              </Link>
              <Link href="/requests" className="home-feature" data-reveal>
                <div className="home-feature__art home-feature__art--people" aria-hidden="true"><span className="mini-message">Looking for a place…</span><span className="mini-message">Let’s find your fit. ↗</span></div>
                <p className="eyebrow">03 · Make a connection</p><h3>Your next chapter starts here.</h3><p>Share what you’re looking for, browse housing requests, and keep conversations in one place.</p><span className="home-feature__link">Browse requests ↗</span>
              </Link>
            </div>
          </section>

          <section id="listings" className="home-listings" aria-labelledby="available-listings">
            <div className="section-heading" data-reveal>
              <div>
                <p className="eyebrow">Find your starting point</p>
                <h2 id="available-listings">Homes around {city.shortLabel}.</h2>
              </div>
              <p className="result-count"><strong>{listings.length}</strong> places found</p>
            </div>

            <HomeCitySearch city={city} />
            <ListingFilters filters={filters} locations={locations} />

            <ListingWorkspace
              listings={listings}
              savedListingIds={savedListingIds}
              signedIn={Boolean(currentUser)}
              initialSelectedListingId={initialSelectedListingId}
              focusCoordinates={city.coordinates}
            />

            {listings.length === 0 && (
              <div className="empty-state"><h3>Room for something new.</h3><p>No homes match this search yet. Try another city or share a housing request so others know what you’re looking for.</p><Link className="button button--primary" href="/requests/new">Post a housing request ↗</Link></div>
            )}
          </section>
        </main>
      </HomeMotion>
    </>
  );
}
