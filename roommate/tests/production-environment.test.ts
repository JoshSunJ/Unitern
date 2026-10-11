import assert from "node:assert/strict";
import test from "node:test";

import {
  ProductionEnvironmentError,
  validateProductionEnvironment,
} from "../lib/production-environment";

const validEnvironment = {
  DATABASE_URL: "postgresql://app:secret@pooler.example.com:6543/unitern?sslmode=require",
  DIRECT_DATABASE_URL: "postgresql://migrations:secret@db.example.com:5432/unitern?sslmode=verify-full",
  AUTH_SECRET: "c8b5f88fdf014187bd7d69c35361dd8f",
  AUTH_URL: "https://unitern.example",
  ADMIN_EMAIL: "moderator@unitern.example",
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "test-resend-key",
  EMAIL_FROM: "Unitern <accounts@unitern.example>",
  PHOTO_STORAGE_DRIVER: "s3",
  S3_BUCKET: "unitern-photos",
  S3_REGION: "auto",
  S3_ENDPOINT: "https://account.r2.cloudflarestorage.com",
  S3_ACCESS_KEY_ID: "test-access-key",
  S3_SECRET_ACCESS_KEY: "test-secret-key",
  PHOTO_PUBLIC_BASE_URL: "https://photos.unitern.example",
  MAPTILER_API_KEY: "test-maptiler-key",
  MAPBOX_ACCESS_TOKEN: "test-routing-token",
};

test("a complete production environment returns only safe operational metadata", () => {
  const summary = validateProductionEnvironment(validEnvironment);

  assert.equal(summary.appOrigin, "https://unitern.example");
  assert.equal(summary.adminEmailDomain, "unitern.example");
  assert.equal(summary.database.runtime.host, "pooler.example.com");
  assert.equal(summary.photoStorage, "s3");
  assert.equal(summary.emailProvider, "resend");
  assert.equal(summary.roadRoutingConfigured, true);
  assert.doesNotMatch(JSON.stringify(summary), /secret|test-maptiler-key|test-routing-token|test-resend-key/);
});

test("production validation rejects placeholders, insecure URLs, and local storage", () => {
  assert.throws(
    () => validateProductionEnvironment({
      ...validEnvironment,
      AUTH_SECRET: "replace-with-a-secret-that-is-long-enough",
      AUTH_URL: "http://unitern.example",
      ADMIN_EMAIL: "admin@example.com",
      PHOTO_STORAGE_DRIVER: "local",
      PHOTO_PUBLIC_BASE_URL: "http://photos.unitern.example",
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProductionEnvironmentError);
      assert.match(error.message, /AUTH_SECRET/);
      assert.match(error.message, /AUTH_URL must use HTTPS/);
      assert.match(error.message, /ADMIN_EMAIL/);
      assert.match(error.message, /PHOTO_STORAGE_DRIVER/);
      assert.match(error.message, /PHOTO_PUBLIC_BASE_URL must use HTTPS/);
      return true;
    },
  );
});

test("custom S3 endpoints require an explicit credential pair", () => {
  assert.throws(
    () => validateProductionEnvironment({
      ...validEnvironment,
      S3_SECRET_ACCESS_KEY: "",
    }),
    /Set both S3_ACCESS_KEY_ID[\s\S]*custom endpoint requires both access-key variables/,
  );
});

test("production rejects an incomplete Google credential pair", () => {
  assert.throws(() => validateProductionEnvironment({ ...validEnvironment, AUTH_GOOGLE_ID: "client.apps.googleusercontent.com" }), /Set both AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET/);
});
