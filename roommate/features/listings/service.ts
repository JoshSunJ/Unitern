import prisma from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "@/lib/current-user";
import { isInCityArea } from "@/features/location-search/city-preference";
import type { CreateListingInput, Listing, ListingFilters } from "./types";

const listingWithOwner = {
  include: { owner: true, photos: { orderBy: { position: "asc" as const } } },
} satisfies Prisma.ListingDefaultArgs;

type ListingRecord = Prisma.ListingGetPayload<typeof listingWithOwner>;

function toListing(record: ListingRecord | null): Listing | undefined {
  if (!record) return undefined;

  return {
    id: record.id,
    ownerId: record.ownerId,
    title: record.title,
    rent: record.rent,
    location: record.location,
    description: record.description,
    bedrooms: record.bedrooms,
    bathroomType: record.bathroomType as Listing["bathroomType"],
    availableFrom: record.availableFrom,
    availableUntil: record.availableUntil,
    roomType: record.roomType as Listing["roomType"],
    leaseType: record.leaseType as Listing["leaseType"],
    furnished: record.furnished,
    utilitiesIncluded: record.utilitiesIncluded,
    utilitiesEstimate: record.utilitiesEstimate,
    securityDeposit: record.securityDeposit,
    parkingAvailable: record.parkingAvailable,
    petsAllowed: record.petsAllowed,
    // The relationship is now the source of truth for a listing's poster.
    postedBy: record.owner.name,
    status: record.status as Listing["status"],
    photos: record.photos.map((photo) => ({
      id: photo.id,
      url: photo.url,
      altText: photo.altText,
      position: photo.position,
    })),
    coordinates:
      record.latitude !== null && record.longitude !== null
        ? { latitude: record.latitude, longitude: record.longitude }
        : undefined,
  };
}

export async function getListings(filters: ListingFilters = {}): Promise<Listing[]> {
  const records = await prisma.listing.findMany({
    ...listingWithOwner,
    where: { status: "active" }, orderBy: { createdAt: "desc" },
  });

  return filterListings(records.map((record) => toListing(record)!), filters);
}

export async function getListingById(id: number): Promise<Listing | undefined> {
  // URL input must fit the positive PostgreSQL integer primary key.
  if (!Number.isInteger(id) || id <= 0 || id > 2_147_483_647) return undefined;
  return toListing(await prisma.listing.findUnique({
    ...listingWithOwner,
    where: { id },
  }));
}

export async function getListingsForOwner(ownerId: number): Promise<Listing[]> {
  const records = await prisma.listing.findMany({
    ...listingWithOwner,
    where: { ownerId },
    orderBy: { createdAt: "desc" },
  });

  return records.map((record) => toListing(record)!);
}

export async function getListingsByIds(ids: number[]): Promise<Listing[]> {
  if (ids.length === 0) return [];
  const records = await prisma.listing.findMany({
    ...listingWithOwner,
    where: { id: { in: ids } },
  });
  const listingsById = new Map(records.map((record) => [record.id, toListing(record)!]));
  return ids.flatMap((id) => {
    const listing = listingsById.get(id);
    return listing ? [listing] : [];
  });
}

export function filterListings(listingsToFilter: Listing[], filters: ListingFilters): Listing[] {
  return listingsToFilter.filter((listing) => {
    const isWithinBudget = filters.maxRent === undefined || listing.rent <= filters.maxRent;
    const isInLocation = !filters.location || listing.location === filters.location;
    const hasEnoughBedrooms = filters.minBedrooms === undefined || listing.bedrooms >= filters.minBedrooms;
    const isInSelectedCity = !filters.city || isInCityArea(listing.coordinates, filters.city);
    return isWithinBudget && isInLocation && hasEnoughBedrooms && isInSelectedCity;
  });
}

export async function getListingLocations(): Promise<string[]> {
  const records = await prisma.listing.findMany({
    distinct: ["location"],
    select: { location: true },
    orderBy: { location: "asc" },
  });

  return records.map((record) => record.location);
}

export async function createListing(
  input: CreateListingInput,
  owner: CurrentUser,
): Promise<Listing> {
  const { coordinates, ...listingData } = input;

  const record = await prisma.listing.create({
    ...listingWithOwner,
    data: {
      ...listingData,
      postedBy: owner.name,
      owner: { connect: { id: owner.id } },
      latitude: coordinates?.latitude,
      longitude: coordinates?.longitude,
    },
  });

  return toListing(record)!;
}

export async function updateListingForOwner(
  listingId: number,
  ownerId: number,
  input: CreateListingInput,
): Promise<Listing | undefined> {
  const { coordinates, ...listingData } = input;

  return prisma.$transaction(async (transaction) => {
    const result = await transaction.listing.updateMany({
      where: { id: listingId, ownerId },
      data: {
        ...listingData,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      },
    });

    if (result.count !== 1) return undefined;

    return toListing(await transaction.listing.findUnique({
      ...listingWithOwner,
      where: { id: listingId },
    }));
  });
}

export async function deleteListingForOwner(
  listingId: number,
  ownerId: number,
): Promise<boolean> {
  // Combining id and ownerId in one database operation makes the ownership
  // check atomic: no caller can delete another person's listing.
  const result = await prisma.listing.deleteMany({
    where: { id: listingId, ownerId },
  });

  return result.count === 1;
}

export async function updateListingStatusForOwner(listingId: number, ownerId: number, status: Listing["status"]): Promise<boolean> {
  const result = await prisma.listing.updateMany({ where: { id: listingId, ownerId }, data: { status } });
  return result.count === 1;
}
