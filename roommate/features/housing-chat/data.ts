import prisma from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

// Public listing fields only. Account, contact, conversation and affiliation data
// must never become part of a model prompt.
const chatListingSelect = {
  id: true, title: true, location: true, description: true, rent: true,
  latitude: true, longitude: true, bedrooms: true, bathroomType: true,
  availableFrom: true, availableUntil: true, roomType: true, leaseType: true,
  furnished: true, utilitiesIncluded: true, utilitiesEstimate: true,
  securityDeposit: true, parkingAvailable: true, petsAllowed: true,
} satisfies Prisma.ListingSelect;

export type ChatListing = Prisma.ListingGetPayload<{ select: typeof chatListingSelect }>;

export async function getPublicChatListing(id: number) {
  if (!Number.isInteger(id) || id < 1 || id > 2_147_483_647) return null;
  return prisma.listing.findFirst({ where: { id, status: "active" }, select: chatListingSelect });
}

export async function getChatListingOptions(selectedId: number | null) {
  const options = await prisma.listing.findMany({
    where: { status: "active" }, take: 30, orderBy: { createdAt: "desc" },
    select: { id: true, title: true, location: true },
  });
  if (selectedId && !options.some(option => option.id === selectedId)) {
    const selected = await prisma.listing.findFirst({
      where: { id: selectedId, status: "active" },
      select: { id: true, title: true, location: true },
    });
    if (selected) options.unshift(selected);
  }
  return options;
}
