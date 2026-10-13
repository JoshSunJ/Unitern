import Navbar from "@/components/Navbar";
import MapSelector from "@/components/MapSelector";
import { getPlaces } from "@/features/places/service";
import { getSavedItemIds } from "@/features/saved-items/service";
import { getListings } from "@/features/listings/service";
import HomeCitySearch from "@/components/HomeCitySearch";
import { getCurrentUser } from "@/lib/current-user";
import { getCityPreference } from "@/features/location-search/server";

export default async function MapPage({ searchParams }: { searchParams: Promise<{ campus?: string }> }) {
  const query = await searchParams;
  const [places, currentUser, city] = await Promise.all([
    getPlaces(),
    getCurrentUser(),
    getCityPreference(),
  ]);
  const savedIds = currentUser ? await getSavedItemIds(currentUser.id) : { listingIds: [], housingRequestIds: [] };
  const listings = await getListings({ city });
  return (
    <>
      <Navbar />
      <main className="explore-page">
        <header className="explore-heading">
          <p className="eyebrow">Explore the area</p>
          <h1>Build a life around {city.shortLabel}.</h1>
          <p>Choose a campus or workplace, select how you travel, and find homes that fit your commute.</p>
          <HomeCitySearch city={city} navigateToListings={false} />
        </header>
        <MapSelector key={city.id} places={places} listings={listings} savedListingIds={savedIds.listingIds} city={city} initialCampusId={query.campus} />
      </main>
    </>
  );
}
