import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export class PhotoValidationError extends Error {}
export class PhotoStorageConfigurationError extends Error {}

export function publicPhotoFilenameValid(filename: string) {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(jpg|png|webp)$/.test(filename);
}

export async function readPublicListingPhoto(filename: string) {
  if (!publicPhotoFilenameValid(filename)) throw new PhotoValidationError("Invalid photo filename.");
  const object = await getS3Client().send(new GetObjectCommand({
    Bucket: getS3StorageConfig().bucket,
    Key: `listings/${filename}`,
  }));
  if (!object.Body || !object.ContentLength || object.ContentLength > MAX_PHOTO_BYTES
    || !ALLOWED_PHOTO_TYPES.includes(object.ContentType as (typeof ALLOWED_PHOTO_TYPES)[number])) {
    throw new PhotoValidationError("Stored photo is not a supported image.");
  }
  const bytes = await object.Body.transformToByteArray();
  if (bytes.length > MAX_PHOTO_BYTES || !hasMatchingSignature(bytes, object.ContentType!)) {
    throw new PhotoValidationError("Stored photo contents are invalid.");
  }
  return { bytes, contentType: object.ContentType!, etag: object.ETag };
}

const extensionByType: Record<(typeof ALLOWED_PHOTO_TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const uploadDirectory = path.join(process.cwd(), "public", "uploads", "listings");

type StorageDriver = "local" | "s3";

type S3StorageConfig = {
  bucket: string;
  publicBaseUrl: string;
};

let s3Client: S3Client | undefined;

function getStorageDriver(): StorageDriver {
  const configuredDriver = process.env.PHOTO_STORAGE_DRIVER;
  const driver = configuredDriver ?? (process.env.NODE_ENV === "production" ? "s3" : "local");

  if (driver !== "local" && driver !== "s3") {
    throw new PhotoStorageConfigurationError(
      "PHOTO_STORAGE_DRIVER must be either local or s3.",
    );
  }
  if (process.env.NODE_ENV === "production" && driver === "local") {
    throw new PhotoStorageConfigurationError(
      "Local photo storage is disabled in production because deployed files are not durable.",
    );
  }
  return driver;
}

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new PhotoStorageConfigurationError(`${name} is required for S3 photo storage.`);
  }
  return value;
}

function getS3StorageConfig(): S3StorageConfig {
  const publicBaseUrl = requiredEnvironmentVariable("PHOTO_PUBLIC_BASE_URL").replace(/\/$/, "");
  const publicUrl = new URL(publicBaseUrl);
  if (process.env.NODE_ENV === "production" && publicUrl.protocol !== "https:") {
    throw new PhotoStorageConfigurationError(
      "PHOTO_PUBLIC_BASE_URL must use HTTPS in production.",
    );
  }

  return {
    bucket: requiredEnvironmentVariable("S3_BUCKET"),
    publicBaseUrl,
  };
}

function getS3Client(): S3Client {
  if (s3Client) return s3Client;

  const region = requiredEnvironmentVariable("S3_REGION");
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();

  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new PhotoStorageConfigurationError(
      "Set both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or neither when using an IAM role.",
    );
  }

  s3Client = new S3Client({
    region,
    ...(endpoint ? { endpoint } : {}),
    ...(accessKeyId && secretAccessKey
      ? { credentials: { accessKeyId, secretAccessKey } }
      : {}),
  });
  return s3Client;
}

function hasMatchingSignature(bytes: Uint8Array, type: string): boolean {
  if (type === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === "image/png") {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
      .every((value, index) => bytes[index] === value);
  }
  if (type === "image/webp") {
    return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

export async function storeListingPhoto(file: File) {
  if (!ALLOWED_PHOTO_TYPES.includes(file.type as (typeof ALLOWED_PHOTO_TYPES)[number])) {
    throw new PhotoValidationError("Upload JPEG, PNG, or WebP images only.");
  }
  if (file.size === 0 || file.size > MAX_PHOTO_BYTES) {
    throw new PhotoValidationError("Each photo must be between 1 byte and 5 MB.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasMatchingSignature(bytes, file.type)) {
    throw new PhotoValidationError("A file's contents do not match its image type.");
  }

  const filename = `${randomUUID()}.${extensionByType[file.type as keyof typeof extensionByType]}`;

  if (getStorageDriver() === "local") {
    await mkdir(uploadDirectory, { recursive: true });
    await writeFile(path.join(uploadDirectory, filename), bytes, { flag: "wx" });
    return { storageKey: filename, url: `/uploads/listings/${filename}` };
  }

  const config = getS3StorageConfig();
  const storageKey = `listings/${filename}`;
  await getS3Client().send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: storageKey,
    Body: bytes,
    ContentType: file.type,
    CacheControl: "public, max-age=31536000, immutable",
  }));

  return { storageKey, url: `${config.publicBaseUrl}/${storageKey}` };
}

export async function removeStoredListingPhoto(storageKey: string): Promise<void> {
  const localKeyPattern = /^[a-f0-9-]+\.(jpg|png|webp)$/;
  const s3KeyPattern = /^listings\/[a-f0-9-]+\.(jpg|png|webp)$/;

  if (!localKeyPattern.test(storageKey) && !s3KeyPattern.test(storageKey)) {
    throw new Error("Refusing to remove an invalid storage key.");
  }

  if (getStorageDriver() === "s3") {
    const config = getS3StorageConfig();
    await getS3Client().send(new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: storageKey,
    }));
    return;
  }

  if (!localKeyPattern.test(storageKey) || path.basename(storageKey) !== storageKey) {
    throw new Error("Refusing to remove a non-local storage key with the local driver.");
  }

  try {
    await unlink(path.join(uploadDirectory, storageKey));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
