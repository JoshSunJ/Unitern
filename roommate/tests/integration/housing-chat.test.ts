import "dotenv/config";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "../../lib/prisma";
import { getPublicChatListing, getChatListingOptions } from "../../features/housing-chat/data";

const email = `chat-fixture-${process.pid}-${Date.now()}@unitern.local`;
after(async () => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) { await prisma.listing.deleteMany({ where: { ownerId: user.id } }); await prisma.user.delete({ where: { id: user.id } }); }
  await prisma.$disconnect();
});

test("the chat reads only active public listing facts and excludes account/contact fields", async () => {
  const owner = await prisma.user.create({ data: { email, name: "Private owner", passwordHash: "private-hash", affiliationName: "Private employer" } });
  const fields = { title: "Chat test home", location: "San Jose, CA", rent: 1000, description: "Public room description", bedrooms: 2, bathroomType: "Shared", availableFrom: "2026-11-01", postedBy: "Private owner", ownerId: owner.id, latitude: 37.33, longitude: -121.88 };
  const active = await prisma.listing.create({ data: fields });
  const filled = await prisma.listing.create({ data: { ...fields, status: "filled" } });
  const context = await getPublicChatListing(active.id);
  assert.equal(context?.location, "San Jose, CA");
  for (const forbidden of ["ownerId", "owner", "postedBy", "email", "passwordHash", "affiliationName"]) assert.equal(forbidden in context!, false);
  assert.equal(await getPublicChatListing(filled.id), null);
  assert.equal(await getPublicChatListing(2_147_483_648), null);
  const options = await getChatListingOptions(active.id);
  assert.ok(options.some(option => option.id === active.id));
  assert.ok(!options.some(option => option.id === filled.id));
});
