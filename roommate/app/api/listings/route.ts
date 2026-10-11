import { createListing, getListings } from "@/features/listings/service";
import { listingInputSchema } from "@/features/listings/schema";
import { getCurrentUser, isVerifiedUser } from "@/lib/current-user";

export async function GET() {
  return Response.json(await getListings());
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Sign in to post a listing." }, { status: 401 });
  }
  if (!isVerifiedUser(currentUser)) return Response.json({ error: "Verify your affiliation before posting a listing." }, { status: 403 });

  const parsed = listingInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json(
    { error: parsed.error.issues[0]?.message ?? "Provide valid listing details." },
    { status: 400 },
  );

  return Response.json(await createListing(parsed.data, currentUser), { status: 201 });
}
