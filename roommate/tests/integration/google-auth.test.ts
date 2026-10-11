import "dotenv/config";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { resolveGoogleUser } from "../../features/google-auth/service";
import { issueEmailVerification } from "../../features/account-email/service";
import prisma from "../../lib/prisma";

const runId = `${process.pid}-${Date.now()}`;
const prefix = `unitern-google-test-${runId}`;
const profile = (name: string) => ({ sub: `${prefix}-${name}`, email: `${prefix}-${name}@gmail.com`, email_verified: true, name: "Google Test" });
after(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.$disconnect();
});

test("Google creates a verified account, preserves its ID on repeated login, and grants no affiliation", async () => {
  const claims = profile("new");
  const user = await resolveGoogleUser(claims);
  assert.ok(user?.emailVerifiedAt);
  assert.equal(user.googleSubject, claims.sub);
  assert.equal(user.passwordHash, null);
  assert.equal(user.verificationStatus, "unverified");
  assert.equal((await resolveGoogleUser(claims))?.id, user.id);
  assert.equal(await resolveGoogleUser({ ...claims, email_verified: false }), null);
});

test("claiming an unverified registration removes its untrusted password and old email tokens", async () => {
  const claims = profile("unverified");
  const existing = await prisma.user.create({ data: { name: "Unverified registrant", email: claims.email, passwordHash: "untrusted-password-hash" } });
  await issueEmailVerification(existing.id);
  await prisma.passwordResetToken.create({ data: { userId: existing.id, tokenHash: `${prefix}-reset`, expiresAt: new Date(Date.now() + 60_000) } });
  const user = await resolveGoogleUser(claims);
  assert.equal(user?.id, existing.id);
  assert.equal(user?.passwordHash, null);
  assert.equal(user?.sessionVersion, 1);
  assert.equal(await prisma.emailVerificationToken.count({ where: { userId: existing.id } }), 0);
  assert.equal(await prisma.passwordResetToken.count({ where: { userId: existing.id } }), 0);
});

test("a verified password account can add Google but a different Google subject cannot take it over", async () => {
  const claims = profile("verified");
  const existing = await prisma.user.create({ data: { name: "Existing owner", email: claims.email, emailVerifiedAt: new Date(), passwordHash: "trusted-password-hash" } });
  const user = await resolveGoogleUser(claims);
  assert.equal(user?.id, existing.id);
  assert.equal(user?.passwordHash, existing.passwordHash);
  assert.equal(await resolveGoogleUser({ ...claims, sub: `${prefix}-different-owner` }), null);
});

test("Google email changes retain the immutable account ID and cannot merge another account", async () => {
  const claims = profile("rename");
  const user = await resolveGoogleUser(claims);
  assert.ok(user);
  const renamed = await resolveGoogleUser({ ...claims, email: `${prefix}-renamed@gmail.com` });
  assert.equal(renamed?.id, user.id);
  assert.equal(renamed?.sessionVersion, user.sessionVersion + 1);
  const other = await resolveGoogleUser(profile("collision"));
  assert.ok(other);
  assert.equal(await resolveGoogleUser({ ...claims, email: other.email }), null);
});

test("simultaneous first Google logins converge on one account", async () => {
  const claims = profile("concurrent");
  const users = await Promise.all([resolveGoogleUser(claims), resolveGoogleUser(claims)]);
  assert.ok(users[0]);
  assert.equal(users[0]?.id, users[1]?.id);
});
