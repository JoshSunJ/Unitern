import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "@/lib/current-user";
import prisma from "@/lib/prisma";
import { isPublicBeta } from "@/features/launch/config";

import type { AffiliationVerificationInput } from "./schema";
import { maskEmail, normalizeEmailDomain } from "./format";
import {
  affiliationTokenExpiresAt,
  createAffiliationVerificationToken,
  hashAffiliationVerificationToken,
} from "./tokens";
import type {
  AffiliationType,
  OrganizationOption,
  VerificationMethod,
  VerificationSnapshot,
} from "./types";

const verificationDetails = {
  include: {
    organization: { select: { name: true } },
    emailToken: { select: { expiresAt: true } },
  },
} satisfies Prisma.AffiliationVerificationDefaultArgs;

type VerificationRecord = Prisma.AffiliationVerificationGetPayload<typeof verificationDetails>;

export type StartVerificationResult =
  | {
      kind: "email_sent";
      verificationId: number;
      token: string;
      recipient: string;
      recipientName: string;
      organizationName: string;
    }
  | { kind: "manual_review"; verificationId: number }
  | { kind: "organization_not_found" }
  | { kind: "invalid_end_date" }
  | { kind: "already_verified" };

export type ReviewResult = "reviewed" | "not-found";

const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1_000;

function verificationExpiresAt(
  affiliationType: AffiliationType,
  expectedEndDate: Date | null,
  now: Date,
) {
  const sixMonthLimit = new Date(now.getTime() + SIX_MONTHS_MS);
  if (affiliationType === "student" || !expectedEndDate) return sixMonthLimit;

  const internshipLimit = new Date(expectedEndDate);
  internshipLimit.setUTCDate(internshipLimit.getUTCDate() + 7);
  return internshipLimit < sixMonthLimit ? internshipLimit : sixMonthLimit;
}

function toSnapshot(record: VerificationRecord, now = new Date()): VerificationSnapshot {
  const emailTokenExpired = record.status === "email_pending"
    && record.emailToken?.expiresAt
    && record.emailToken.expiresAt <= now;
  const verificationExpired = record.status === "verified"
    && record.expiresAt
    && record.expiresAt <= now;

  return {
    id: record.id,
    affiliationType: record.affiliationType as AffiliationType,
    organizationName: record.organization?.name ?? record.claimedOrganizationName,
    maskedAffiliationEmail: maskEmail(record.affiliationEmail),
    method: record.method as VerificationMethod,
    status: emailTokenExpired || verificationExpired
      ? "expired"
      : record.status as VerificationSnapshot["status"],
    reviewerNote: record.reviewerNote,
    submittedAt: record.submittedAt,
    verifiedAt: record.verifiedAt,
    expiresAt: record.expiresAt,
  };
}

export async function getOrganizationOptions(): Promise<OrganizationOption[]> {
  const organizations = await prisma.organization.findMany({
    where: { active: true },
    select: { id: true, name: true, type: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  return organizations.map((organization) => ({
    ...organization,
    type: organization.type as AffiliationType,
  }));
}

export async function getLatestVerification(
  userId: number,
  now = new Date(),
): Promise<VerificationSnapshot | null> {
  const record = await prisma.affiliationVerification.findFirst({
    ...verificationDetails,
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return record ? toSnapshot(record, now) : null;
}

export async function startAffiliationVerification(
  user: CurrentUser,
  input: AffiliationVerificationInput,
  now = new Date(),
): Promise<StartVerificationResult> {
  if (user.verificationStatus === "verified"
    && (!user.affiliationExpiresAt || user.affiliationExpiresAt > now)) {
    return { kind: "already_verified" };
  }

  const expectedEndDate = input.expectedEndDate
    ? new Date(`${input.expectedEndDate}T23:59:59.999Z`)
    : null;
  if (expectedEndDate && expectedEndDate <= now) return { kind: "invalid_end_date" };

  const organization = input.organizationId === null
    ? null
    : await prisma.organization.findFirst({
        where: {
          id: input.organizationId,
          type: input.affiliationType,
          active: true,
        },
        include: { domains: { select: { domain: true } } },
      });
  if (input.organizationId !== null && !organization) {
    return { kind: "organization_not_found" };
  }

  const affiliationEmail = input.affiliationEmail.toLowerCase();
  const emailDomain = normalizeEmailDomain(affiliationEmail);
  const domainTrusted = Boolean(
    organization?.domains.some((candidate) => candidate.domain === emailDomain),
  );
  const organizationName = organization?.name ?? input.organizationName;
  const emailVerification = domainTrusted && !isPublicBeta();
  const method: VerificationMethod = emailVerification
    ? "institution_email"
    : "manual_review";
  const status = emailVerification ? "email_pending" : "pending_review";
  const rawToken = emailVerification ? createAffiliationVerificationToken() : null;

  const verification = await prisma.$transaction(async (transaction) => {
    await transaction.affiliationVerification.updateMany({
      where: {
        userId: user.id,
        status: { in: ["email_pending", "pending_review"] },
      },
      data: { status: "expired" },
    });
    await transaction.affiliationVerificationToken.deleteMany({
      where: { verification: { userId: user.id } },
    });

    const attempt = await transaction.affiliationVerification.create({
      data: {
        userId: user.id,
        organizationId: organization?.id,
        affiliationType: input.affiliationType,
        claimedOrganizationName: organizationName,
        affiliationEmail,
        expectedEndDate,
        method,
        status,
        submittedAt: now,
        ...(rawToken ? {
          emailToken: {
            create: {
              tokenHash: hashAffiliationVerificationToken(rawToken),
              expiresAt: affiliationTokenExpiresAt(now),
            },
          },
        } : {}),
      },
    });

    await transaction.user.update({
      where: { id: user.id },
      data: {
        affiliationType: input.affiliationType,
        affiliationName: organizationName,
        affiliationVerificationMethod: method,
        verificationStatus: "submitted",
        verificationSubmittedAt: now,
        affiliationVerifiedAt: null,
        affiliationExpiresAt: null,
      },
    });

    return attempt;
  });

  if (!rawToken) return { kind: "manual_review", verificationId: verification.id };
  return {
    kind: "email_sent",
    verificationId: verification.id,
    token: rawToken,
    recipient: affiliationEmail,
    recipientName: user.name,
    organizationName,
  };
}

export async function consumeAffiliationVerification(
  token: string,
  now = new Date(),
): Promise<boolean> {
  if (token.length < 32 || token.length > 256) return false;
  const tokenHash = hashAffiliationVerificationToken(token);

  return prisma.$transaction(async (transaction) => {
    const tokenRecord = await transaction.affiliationVerificationToken.findUnique({
      where: { tokenHash },
      include: { verification: true },
    });

    if (!tokenRecord
      || tokenRecord.expiresAt <= now
      || tokenRecord.verification.status !== "email_pending") {
      if (tokenRecord) {
        await transaction.affiliationVerificationToken.delete({
          where: { id: tokenRecord.id },
        });
        await transaction.affiliationVerification.updateMany({
          where: { id: tokenRecord.verificationId, status: "email_pending" },
          data: { status: "expired" },
        });
      }
      return false;
    }

    const consumed = await transaction.affiliationVerificationToken.deleteMany({
      where: { id: tokenRecord.id, tokenHash },
    });
    if (consumed.count !== 1) return false;

    const attempt = tokenRecord.verification;
    const expiresAt = verificationExpiresAt(
      attempt.affiliationType as AffiliationType,
      attempt.expectedEndDate,
      now,
    );

    await transaction.affiliationVerification.update({
      where: { id: attempt.id },
      data: { status: "verified", verifiedAt: now, expiresAt },
    });
    await transaction.user.update({
      where: { id: attempt.userId },
      data: {
        affiliationType: attempt.affiliationType,
        affiliationName: attempt.claimedOrganizationName,
        affiliationVerificationMethod: attempt.method,
        verificationStatus: "verified",
        affiliationVerifiedAt: now,
        affiliationExpiresAt: expiresAt,
      },
    });
    return true;
  });
}

export async function getSubmittedVerifications() {
  const records = await prisma.affiliationVerification.findMany({
    where: { status: "pending_review" },
    select: {
      id: true,
      affiliationType: true,
      claimedOrganizationName: true,
      affiliationEmail: true,
      expectedEndDate: true,
      method: true,
      submittedAt: true,
      user: { select: { id: true, name: true, email: true } },
      organization: { select: { name: true } },
    },
    orderBy: { submittedAt: "asc" },
  });

  return records.map((record) => ({
    ...record,
    organizationName: record.organization?.name ?? record.claimedOrganizationName,
  }));
}

export async function reviewVerification(
  verificationId: number,
  reviewerId: number,
  status: "verified" | "rejected",
  reviewerNote: string | null,
  now = new Date(),
): Promise<ReviewResult> {
  const attempt = await prisma.affiliationVerification.findFirst({
    where: { id: verificationId, status: "pending_review" },
  });
  if (!attempt) return "not-found";

  const expiresAt = status === "verified"
    ? verificationExpiresAt(
        attempt.affiliationType as AffiliationType,
        attempt.expectedEndDate,
        now,
      )
    : null;

  return prisma.$transaction(async (transaction) => {
    const reviewed = await transaction.affiliationVerification.updateMany({
      where: { id: verificationId, status: "pending_review" },
      data: {
        status,
        reviewerId,
        reviewerNote,
        reviewedAt: now,
        verifiedAt: status === "verified" ? now : null,
        expiresAt,
      },
    });
    if (reviewed.count !== 1) return "not-found";

    await transaction.user.update({
      where: { id: attempt.userId },
      data: {
        affiliationType: attempt.affiliationType,
        affiliationName: attempt.claimedOrganizationName,
        affiliationVerificationMethod: attempt.method,
        verificationStatus: status,
        affiliationVerifiedAt: status === "verified" ? now : null,
        affiliationExpiresAt: expiresAt,
      },
    });
    return "reviewed";
  });
}
