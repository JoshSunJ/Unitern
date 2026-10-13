import "dotenv/config";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "../../lib/prisma";
import { DEMO_OWNER_EMAIL } from "../../features/listings/demo-data";
import { startConversation } from "../../features/conversations/service";
import { getListingById } from "../../features/listings/service";

let listingId: number | undefined;
let seekerId: number | undefined;
let createdOwnerId: number | undefined;
after(async () => {
  if (listingId) await prisma.listing.delete({ where: { id: listingId } });
  if (seekerId) await prisma.user.delete({ where: { id: seekerId } });
  if (createdOwnerId) await prisma.user.delete({ where: { id: createdOwnerId } });
  await prisma.$disconnect();
});

test("fictional sample homes are marked and cannot create messages to a fake landlord", async () => {
  const existing = await prisma.user.findUnique({ where: { email: DEMO_OWNER_EMAIL } });
  const owner = existing ?? await prisma.user.create({ data: { email: DEMO_OWNER_EMAIL, name: "Fictional sample owner" } });
  if (!existing) createdOwnerId = owner.id;
  const seeker = await prisma.user.create({ data: { email: `demo-test-${process.pid}-${Date.now()}@integration.unitern.local`, name: "Fixture seeker" } });
  seekerId = seeker.id;
  const listing = await prisma.listing.create({ data: { ownerId: owner.id, title: "[Demo] Contact guard fixture", description: "Not a real rental", postedBy: owner.name, rent: 1000, location: "San Jose", bedrooms: 1, bathroomType: "Private", availableFrom: "2027-01-01" } });
  listingId = listing.id;
  assert.equal((await getListingById(listing.id))?.isDemo, true);
  assert.deepEqual(await startConversation({ listingId: listing.id, message: "I am testing this fictional posting." }, seeker.id), { kind: "listing-not-found" });
  assert.equal(await prisma.conversation.count({ where: { listingId: listing.id } }), 0);
});
