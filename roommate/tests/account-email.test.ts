import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEmailVerificationUrl,
  EmailDeliveryConfigurationError,
  sendEmailVerification,
  sendPasswordReset,
  sendAffiliationVerification,
  validateEmailDeliveryConfiguration,
} from "../features/account-email/delivery";
import {
  createEmailVerificationToken,
  emailVerificationExpiresAt,
  hashEmailVerificationToken,
} from "../features/account-email/tokens";

test("verification tokens are random, hashed, and expire after 24 hours", () => {
  const first = createEmailVerificationToken();
  const second = createEmailVerificationToken();
  const now = new Date("2026-08-25T12:00:00.000Z");

  assert.notEqual(first, second);
  assert.ok(first.length >= 32);
  assert.equal(hashEmailVerificationToken(first).length, 64);
  assert.notEqual(hashEmailVerificationToken(first), first);
  assert.equal(emailVerificationExpiresAt(now).toISOString(), "2026-08-26T12:00:00.000Z");
});

test("verification URLs use the configured trusted application origin", () => {
  assert.equal(
    buildEmailVerificationUrl("safe-token", { AUTH_URL: "https://unitern.example" }),
    "https://unitern.example/api/auth/verify-email?token=safe-token",
  );
});

test("preview delivery is blocked in production", async () => {
  await assert.rejects(
    sendEmailVerification(
      { recipient: "student@example.com", name: "Student", token: "token", idempotencyKey: "one" },
      { NODE_ENV: "production", AUTH_URL: "https://unitern.example", EMAIL_PROVIDER: "preview" },
    ),
    EmailDeliveryConfigurationError,
  );
});

test("production email requires HTTPS and server-only Resend credentials", () => {
  assert.throws(
    () => validateEmailDeliveryConfiguration({
      NODE_ENV: "production",
      AUTH_URL: "http://unitern.example",
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "secret",
      EMAIL_FROM: "Unitern <accounts@unitern.example>",
    }),
    /HTTPS/,
  );
  assert.throws(
    () => validateEmailDeliveryConfiguration({
      NODE_ENV: "production",
      AUTH_URL: "https://unitern.example",
      EMAIL_PROVIDER: "resend",
    }),
    /RESEND_API_KEY/,
  );
});

test("resend delivery keeps credentials server-side and sends an idempotent request", async () => {
  let request: Request | undefined;
  const fetchMock: typeof fetch = async (input, init) => {
    request = new Request(input, init);
    return Response.json({ id: "email-1" });
  };

  const result = await sendEmailVerification(
    { recipient: "student@example.com", name: "Student", token: "secret-token", idempotencyKey: "verification-1" },
    {
      NODE_ENV: "production",
      AUTH_URL: "https://unitern.example",
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "server-secret",
      EMAIL_FROM: "Unitern <accounts@unitern.example>",
    },
    fetchMock,
  );

  assert.equal(result.provider, "resend");
  assert.equal(result.providerMessageId, "email-1");
  assert.equal(request?.url, "https://api.resend.com/emails");
  assert.equal(request?.headers.get("authorization"), "Bearer server-secret");
  assert.equal(request?.headers.get("idempotency-key"), "verification-1");
});

test("disabled beta delivery neither calls an email provider nor exposes preview links", async () => {
  const environment = { NODE_ENV: "production", AUTH_URL: "https://unitern.example", UNITERN_LAUNCH_MODE: "public_beta", EMAIL_PROVIDER: "disabled" };
  const message = { recipient: "student@example.com", name: "Student", token: "private-token", idempotencyKey: "beta" };
  let requests = 0;
  const fetchMock: typeof fetch = async () => { requests++; return Response.json({ id: "unexpected" }); };
  for (const send of [sendEmailVerification(message, environment, fetchMock), sendPasswordReset(message, environment, fetchMock), sendAffiliationVerification({ ...message, organizationName: "School" }, environment, fetchMock)]) {
    await assert.rejects(send, /unavailable during the public beta/);
  }
  assert.equal(requests, 0);
  assert.throws(() => validateEmailDeliveryConfiguration({ ...environment, AUTH_URL: "http://unitern.example" }), /HTTPS/);
  assert.throws(() => validateEmailDeliveryConfiguration({ ...environment, UNITERN_LAUNCH_MODE: "full" }), /EMAIL_PROVIDER must be set to resend/);
});
