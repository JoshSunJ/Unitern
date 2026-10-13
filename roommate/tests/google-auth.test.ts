import assert from "node:assert/strict";
import test from "node:test";
import { googleSignInEnabled, passwordSignupEnabled, safeSignInDestination } from "../features/google-auth/config";
import { verifiedGoogleIdentity } from "../features/google-auth/profile";

test("Google identity requires verified email and authoritative Gmail or Workspace claims", () => {
  const profile = { sub: "google-subject", email: "Person@gmail.com", email_verified: true, name: "Person" };
  assert.equal(verifiedGoogleIdentity(profile)?.email, "person@gmail.com");
  assert.equal(verifiedGoogleIdentity({ ...profile, email_verified: false }), null);
  assert.equal(verifiedGoogleIdentity({ ...profile, sub: "" }), null);
  assert.equal(verifiedGoogleIdentity({ ...profile, email: "person@external.example" }), null);
  assert.equal(verifiedGoogleIdentity({ ...profile, email: "person@school.example", hd: "school.example" })?.subject, profile.sub);
});

test("sign-in return destinations cannot leave the app or loop through auth", () => {
  assert.equal(safeSignInDestination("/verify?step=school"), "/verify?step=school");
  for (const path of [undefined, "https://evil.example", "//evil.example", "/\\evil.example", "/api/auth/signout", "/sign-in", "/\n/evil.example"]) {
    assert.equal(safeSignInDestination(path), "/dashboard");
  }
});

test("Google requires both credentials and the Resend test sender cannot offer public password signup", () => {
  assert.equal(googleSignInEnabled({ AUTH_GOOGLE_ID: "client" }), false);
  assert.equal(googleSignInEnabled({ AUTH_GOOGLE_ID: "client", AUTH_GOOGLE_SECRET: "secret" }), true);
  assert.equal(passwordSignupEnabled({ NODE_ENV: "production", EMAIL_PROVIDER: "resend", EMAIL_FROM: "Unitern <onboarding@resend.dev>" }), false);
  assert.equal(passwordSignupEnabled({ NODE_ENV: "development", EMAIL_PROVIDER: "preview" }), true);
});

test("public beta disables password registration even with a verified email sender", () => {
  assert.equal(passwordSignupEnabled({ UNITERN_LAUNCH_MODE: "public_beta", NODE_ENV: "production", EMAIL_PROVIDER: "resend", EMAIL_FROM: "Unitern <accounts@unitern.example>" }), false);
  assert.equal(passwordSignupEnabled({ EMAIL_PROVIDER: "disabled" }), false);
});
