import { publicPhotoFilenameValid, readPublicListingPhoto } from "@/features/listing-photos/storage";
import { logOperationalError } from "@/lib/operational-log";

export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  // Enable delivery only when this deployment explicitly uses the app's photo
  // origin. Other bucket namespaces and arbitrary object keys remain private.
  const deliveryOrigin = `${process.env.AUTH_URL?.replace(/\/$/, "")}/api/photos`;
  if (process.env.PHOTO_PUBLIC_BASE_URL?.replace(/\/$/, "") !== deliveryOrigin || !publicPhotoFilenameValid(filename)) {
    return new Response(null, { status: 404 });
  }
  try {
    const photo = await readPublicListingPhoto(filename);
    return new Response(new Uint8Array(photo.bytes).buffer, { headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      ...(photo.etag ? { ETag: photo.etag } : {}),
    } });
  } catch (error) {
    if (error instanceof Error && ["NoSuchKey", "NotFound"].includes(error.name)) return new Response(null, { status: 404 });
    logOperationalError("photo.delivery.failed");
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
