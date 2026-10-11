import { z } from "zod";
import {
  deleteListingPhotoForOwner,
  setListingCoverPhotoForOwner,
} from "@/features/listing-photos/service";
import { removeStoredListingPhoto } from "@/features/listing-photos/storage";
import { getCurrentUser } from "@/lib/current-user";

type RouteProps = { params: Promise<{ id: string; photoId: string }> };
const photoOperationSchema = z.object({ action: z.literal("cover") });

function parseIds(id: string, photoId: string) {
  const listingId = Number(id);
  const parsedPhotoId = Number(photoId);
  return Number.isInteger(listingId) && listingId > 0 && Number.isInteger(parsedPhotoId) && parsedPhotoId > 0
    ? { listingId, photoId: parsedPhotoId }
    : null;
}

export async function DELETE(_request: Request, { params }: RouteProps) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to manage photos." }, { status: 401 });

  const { id, photoId } = await params;
  const ids = parseIds(id, photoId);
  if (!ids) return Response.json({ error: "Photo not found." }, { status: 404 });

  const storageKey = await deleteListingPhotoForOwner(ids.listingId, ids.photoId, user.id);
  if (!storageKey) return Response.json({ error: "Photo not found." }, { status: 404 });

  try {
    await removeStoredListingPhoto(storageKey);
  } catch (error) {
    // The database remains authoritative. A later cleanup job can remove an orphaned file.
    console.error("Could not remove orphaned listing photo", { storageKey, error });
  }
  return new Response(null, { status: 204 });
}

export async function PATCH(request: Request, { params }: RouteProps) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to manage photos." }, { status: 401 });

  const { id, photoId } = await params;
  const ids = parseIds(id, photoId);
  const operation = photoOperationSchema.safeParse(await request.json().catch(() => null));
  if (!ids || !operation.success) {
    return Response.json({ error: "Provide a valid photo operation." }, { status: 400 });
  }

  const updated = await setListingCoverPhotoForOwner(ids.listingId, ids.photoId, user.id);
  if (!updated) return Response.json({ error: "Photo not found." }, { status: 404 });
  return Response.json({ ok: true });
}
