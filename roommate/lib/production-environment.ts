import { z } from "zod";

import {
  type ProductionDatabaseConfiguration,
  validateProductionDatabaseConfiguration,
} from "@/lib/database-config";
import { validateEmailDeliveryConfiguration } from "@/features/account-email/delivery";
import { isPublicBeta } from "@/features/launch/config";

type Environment = Record<string, string | undefined>;

export type ProductionEnvironmentSummary = {
  appOrigin: string;
  adminEmailDomain: string;
  database: ProductionDatabaseConfiguration;
  photoStorage: "s3";
  mapSearchProvider: "maptiler";
  emailProvider: "resend" | "disabled";
  roadRoutingConfigured: boolean;
};

export class ProductionEnvironmentError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Production configuration is invalid:\n- ${issues.join("\n- ")}`);
    this.name = "ProductionEnvironmentError";
    this.issues = issues;
  }
}

function value(environment: Environment, name: string) {
  return environment[name]?.trim() ?? "";
}

function parseHttpsUrl(
  rawValue: string,
  name: string,
  issues: string[],
): URL | null {
  if (!rawValue) {
    issues.push(`${name} is required.`);
    return null;
  }

  try {
    const url = new URL(rawValue);
    if (url.protocol !== "https:") {
      issues.push(`${name} must use HTTPS.`);
      return null;
    }
    if (url.username || url.password) {
      issues.push(`${name} must not contain credentials.`);
      return null;
    }
    return url;
  } catch {
    issues.push(`${name} must be a valid URL.`);
    return null;
  }
}

export function validateProductionEnvironment(
  environment: Environment = process.env,
): ProductionEnvironmentSummary {
  const issues: string[] = [];
  let database: ProductionDatabaseConfiguration | null = null;

  try {
    database = validateProductionDatabaseConfiguration(environment);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "Database configuration is invalid.");
  }

  const authSecret = value(environment, "AUTH_SECRET");
  if (authSecret.length < 32 || /replace|change.?me|example|ci-only/i.test(authSecret)) {
    issues.push("AUTH_SECRET must be a unique production secret of at least 32 characters.");
  }

  const authUrl = parseHttpsUrl(value(environment, "AUTH_URL"), "AUTH_URL", issues);
  const beta = isPublicBeta(environment);
  if (value(environment, "UNITERN_LAUNCH_MODE") && !["full", "public_beta"].includes(value(environment, "UNITERN_LAUNCH_MODE"))) {
    issues.push("UNITERN_LAUNCH_MODE must be full or public_beta.");
  }
  if (beta && (!value(environment, "AUTH_GOOGLE_ID") || !value(environment, "AUTH_GOOGLE_SECRET"))) {
    issues.push("Public beta requires Google sign-in credentials.");
  }
  if (beta && value(environment, "EMAIL_PROVIDER") !== "disabled") {
    issues.push("Public beta must explicitly disable outbound email.");
  }
  if (Boolean(value(environment, "AUTH_GOOGLE_ID")) !== Boolean(value(environment, "AUTH_GOOGLE_SECRET"))) {
    issues.push("Set both AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET to enable Google sign-in.");
  }

  if (authUrl) {
    try {
      validateEmailDeliveryConfiguration({
        ...environment,
        NODE_ENV: "production",
        AUTH_URL: authUrl.toString(),
      });
    } catch (error) {
      issues.push(error instanceof Error
        ? error.message
        : "Account email configuration is invalid.");
    }
  }

  const adminEmail = value(environment, "ADMIN_EMAIL").toLowerCase();
  if (!z.string().email().safeParse(adminEmail).success || adminEmail === "admin@example.com") {
    issues.push("ADMIN_EMAIL must be a real administrator email address.");
  }

  if (value(environment, "PHOTO_STORAGE_DRIVER") !== "s3") {
    issues.push("PHOTO_STORAGE_DRIVER must be s3 in production.");
  }

  for (const name of ["S3_BUCKET", "S3_REGION", "PHOTO_PUBLIC_BASE_URL"] as const) {
    if (!value(environment, name)) issues.push(`${name} is required.`);
  }
  const photoPublicBaseUrl = value(environment, "PHOTO_PUBLIC_BASE_URL");
  if (photoPublicBaseUrl) {
    parseHttpsUrl(photoPublicBaseUrl, "PHOTO_PUBLIC_BASE_URL", issues);
  }

  const s3Endpoint = value(environment, "S3_ENDPOINT");
  if (s3Endpoint) parseHttpsUrl(s3Endpoint, "S3_ENDPOINT", issues);

  const accessKeyId = value(environment, "S3_ACCESS_KEY_ID");
  const secretAccessKey = value(environment, "S3_SECRET_ACCESS_KEY");
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    issues.push("Set both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or neither when using an IAM role.");
  }
  if (s3Endpoint && (!accessKeyId || !secretAccessKey)) {
    issues.push("An S3-compatible custom endpoint requires both access-key variables.");
  }

  if (!value(environment, "MAPTILER_API_KEY")) {
    issues.push("MAPTILER_API_KEY is required for production location search.");
  }

  if (issues.length > 0 || !database || !authUrl) {
    throw new ProductionEnvironmentError(issues);
  }

  return {
    appOrigin: authUrl.origin,
    adminEmailDomain: adminEmail.split("@")[1],
    database,
    photoStorage: "s3",
    mapSearchProvider: "maptiler",
    emailProvider: beta ? "disabled" : "resend",
    roadRoutingConfigured: Boolean(value(environment, "MAPBOX_ACCESS_TOKEN")),
  };
}
