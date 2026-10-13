import "dotenv/config";

import assert from "node:assert/strict";
import { after, test } from "node:test";

import {
  consumeAffiliationVerification,
  reviewVerification,
  startAffiliationVerification,
} from "../../features/verification/service";
import type { CurrentUser } from "../../lib/current-user";
import prisma from "../../lib/prisma";

const runId = `${process.pid}-${Date.now()}`;
const studentEmail = `student-${runId}@integration.unitern.local`;
const fallbackEmail = `fallback-${runId}@integration.unitern.local`;
const reviewerEmail = `reviewer-${runId}@integration.unitern.local`;
const betaEmail = `beta-${runId}@integration.unitern.local`;
const emails = [studentEmail, fallbackEmail, reviewerEmail, betaEmail];

function asCurrentUser(user: {
  id: number;
  name: string;
  email: string;
}): CurrentUser {
  return {
    ...user,
    affiliationType: null,
    affiliationName: null,
    affiliationVerificationMethod: null,
    affiliationExpiresAt: null,
    verificationStatus: "unverified",
  };
}

after(async () => {
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
});

test("a trusted organization domain verifies through a single-use email token", async () => {
  const organization = await prisma.organization.findFirstOrThrow({
    where: { domains: { some: { domain: "sjsu.edu" } }, type: "student" },
  });
  const user = await prisma.user.create({
    data: { name: "Affiliation Student", email: studentEmail },
  });
  const now = new Date("2026-08-30T12:00:00.000Z");

  const started = await startAffiliationVerification(asCurrentUser(user), {
    affiliationType: "student",
    organizationId: organization.id,
    organizationName: "",
    affiliationEmail: `student-${runId}@sjsu.edu`,
    expectedEndDate: null,
  }, now);

  assert.equal(started.kind, "email_sent");
  if (started.kind !== "email_sent") return;

  const storedToken = await prisma.affiliationVerificationToken.findUniqueOrThrow({
    where: { verificationId: started.verificationId },
  });
  assert.notEqual(storedToken.tokenHash, started.token);
  assert.equal(await consumeAffiliationVerification(started.token, now), true);
  assert.equal(await consumeAffiliationVerification(started.token, now), false);

  const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(updated.verificationStatus, "verified");
  assert.equal(updated.affiliationVerificationMethod, "institution_email");
  assert.equal(updated.affiliationName, "San José State University");
  assert.equal(updated.affiliationExpiresAt?.toISOString(), "2027-02-26T12:00:00.000Z");
});

test("an unknown organization uses an auditable administrator-review fallback", async () => {
  const [user, reviewer] = await Promise.all([
    prisma.user.create({ data: { name: "Fallback Applicant", email: fallbackEmail } }),
    prisma.user.create({ data: { name: "Verification Reviewer", email: reviewerEmail } }),
  ]);
  const now = new Date("2026-08-30T12:00:00.000Z");

  const started = await startAffiliationVerification(asCurrentUser(user), {
    affiliationType: "intern",
    organizationId: null,
    organizationName: "Small Startup",
    affiliationEmail: `intern-${runId}@small-startup.example`,
    expectedEndDate: "2026-10-15",
  }, now);

  assert.equal(started.kind, "manual_review");
  if (started.kind !== "manual_review") return;

  assert.equal(await reviewVerification(
    started.verificationId,
    reviewer.id,
    "verified",
    "Confirmed the company offer through the approved fallback process.",
    now,
  ), "reviewed");
  assert.equal(await reviewVerification(
    started.verificationId,
    reviewer.id,
    "rejected",
    null,
    now,
  ), "not-found");

  const [attempt, updated] = await Promise.all([
    prisma.affiliationVerification.findUniqueOrThrow({
      where: { id: started.verificationId },
    }),
    prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
  ]);
  assert.equal(attempt.reviewerId, reviewer.id);
  assert.equal(attempt.method, "manual_review");
  assert.match(attempt.reviewerNote ?? "", /approved fallback process/);
  assert.equal(updated.verificationStatus, "verified");
  assert.equal(updated.affiliationExpiresAt?.toISOString(), "2026-10-22T23:59:59.999Z");
});

test("public beta queues a trusted school email for review without granting access or creating an email token", async () => {
  const previous = process.env.UNITERN_LAUNCH_MODE;
  process.env.UNITERN_LAUNCH_MODE = "public_beta";
  try {
    const organization = await prisma.organization.findFirstOrThrow({ where: { domains: { some: { domain: "sjsu.edu" } }, type: "student" } });
    const user = await prisma.user.create({ data: { name: "Beta Applicant", email: betaEmail } });
    const started = await startAffiliationVerification(asCurrentUser(user), { affiliationType: "student", organizationId: organization.id, organizationName: "", affiliationEmail: `beta-${runId}@sjsu.edu`, expectedEndDate: null });
    assert.equal(started.kind, "manual_review");
    if (started.kind !== "manual_review") return;
    const [attempt, updated, tokenCount] = await Promise.all([
      prisma.affiliationVerification.findUniqueOrThrow({ where: { id: started.verificationId } }),
      prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
      prisma.affiliationVerificationToken.count({ where: { verificationId: started.verificationId } }),
    ]);
    assert.equal(attempt.method, "manual_review");
    assert.equal(attempt.status, "pending_review");
    assert.equal(updated.verificationStatus, "submitted");
    assert.equal(updated.affiliationVerifiedAt, null);
    assert.equal(tokenCount, 0);
  } finally {
    if (previous === undefined) delete process.env.UNITERN_LAUNCH_MODE;
    else process.env.UNITERN_LAUNCH_MODE = previous;
  }
});
