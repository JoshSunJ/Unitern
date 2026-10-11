import {
  deleteListingForOwner,
  getListingById,
  updateListingForOwner,
  updateListingStatusForOwner,
} from "@/features/listings/service";
import { listingPatchSchema } from "@/features/listings/schema";
import { getCurrentUser } from "@/lib/current-user";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteProps) {
  const { id } = await params;
  const listing = await getListingById(Number(id));

  if (!listing) {
    return Response.json({ error: "Listing not found" }, { status: 404 });
  }

  return Response.json(listing);
}

export async function DELETE(_request: Request, { params }: RouteProps) {
  const { id } = await params;
  const listingId = Number(id);

  if (!Number.isInteger(listingId) || listingId <= 0) {
    return Response.json({ error: "Listing not found" }, { status: 404 });
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.json({ error: "Sign in to manage listings." }, { status: 401 });
  }

  const wasDeleted = await deleteListingForOwner(listingId, currentUser.id);

  if (!wasDeleted) {
    // Do not reveal whether a non-owned listing exists.
    return Response.json({ error: "Listing not found" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}

export async function PATCH(request: Request, { params }: RouteProps) {
  const { id } = await params;
  const listingId = Number(id);
  if (!Number.isInteger(listingId) || listingId <= 0) {
    return Response.json({ error: "Listing not found." }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to manage listings." }, { status: 401 });

  const parsed = listingPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json(
    { error: parsed.error.issues[0]?.message ?? "Provide a valid listing update." },
    { status: 400 },
  );

  if (parsed.data.action === "status") {
    const updated = await updateListingStatusForOwner(listingId, user.id, parsed.data.status);
    if (!updated) return Response.json({ error: "Listing not found." }, { status: 404 });
    return Response.json({ ok: true });
  }

  const listing = await updateListingForOwner(listingId, user.id, parsed.data.listing);
  if (!listing) return Response.json({ error: "Listing not found." }, { status: 404 });
  return Response.json(listing);
}
