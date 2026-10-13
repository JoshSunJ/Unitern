import "dotenv/config";
import prisma from "../lib/prisma";
import { DEMO_OWNER_EMAIL, demoListings } from "../features/listings/demo-data";

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? "");
  const local = ["127.0.0.1", "localhost"].includes(database.hostname);
  const staging = process.env.SEED_TARGET === "unitern-staging-507303-n7"
    && process.env.AUTH_URL === "https://unitern-staging-web-bsifxobpda-uw.a.run.app"
    && database.hostname === process.env.EXPECTED_DATABASE_HOST
    && database.hostname.endsWith(".neon.tech");
  if (!(local && process.env.SEED_TARGET === "local") && !staging) throw new Error("Select the local or Unitern staging database explicitly.");
  const ids = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email: DEMO_OWNER_EMAIL } });
    if (existing?.passwordHash || existing?.googleSubject) throw new Error("The fictional owner must have no sign-in credentials.");
    const owner = existing ?? await tx.user.create({ data: { email: DEMO_OWNER_EMAIL, name: "Unitern demo — fictional poster" } });
    const owned = await tx.listing.findMany({ where: { ownerId: owner.id }, select: { id: true, title: true } });
    if (owned.some((record) => !demoListings.some((sample) => sample.title === record.title)) || owned.length > 5 || new Set(owned.map((record) => record.title)).size !== owned.length) throw new Error("Unexpected sample data.");
    const result: number[] = [];
    for (const sample of demoListings) {
      const record = owned.find((record) => record.title === sample.title);
      const data = {
        ...sample,
        description: "SAMPLE LISTING — not a real rental. This fictional posting is for testing city filters, saves, listing details, maps and commute estimates. The map pin is approximate and does not represent an available property. No real landlord can be contacted.",
        bathroomType: "Private", availableFrom: "2027-01-01", availableUntil: "2027-08-31",
        roomType: sample.bedrooms === 2 || sample.title.includes("studio") ? "entire_place" : "private", leaseType: "fixed_term",
        utilitiesIncluded: sample.rent < 1500, parkingAvailable: sample.rent >= 1500, petsAllowed: false,
        postedBy: owner.name, status: "active", ownerId: owner.id,
      };
      const listing = record ? await tx.listing.update({ where: { id: record.id }, data }) : await tx.listing.create({ data });
      result.push(listing.id);
    }
    return result;
  });
  console.log(JSON.stringify({ sampleListings: ids.length, listingIds: ids, cities: ["San Jose", "Los Angeles"] }));
}

main().catch(() => { console.error("Sample seed failed; no unrelated listings were changed. Check the target and sample owner."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
