import {
  emailDeliveryFailureAttributes,
  sendAffiliationVerification,
} from "@/features/account-email/delivery";
import {
  affiliationVerificationInputSchema,
} from "@/features/verification/schema";
import { startAffiliationVerification } from "@/features/verification/service";
import {
  enforceRateLimit,
  rateLimitResponse,
  requestNetworkIdentifier,
} from "@/features/security/rate-limit";
import { getCurrentUser } from "@/lib/current-user";
import { logOperationalError, logOperationalInfo } from "@/lib/operational-log";
import { isPublicBeta } from "@/features/launch/config";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Sign in to verify your affiliation." }, { status: 401 });
  }

  const input = affiliationVerificationInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!input.success) {
    return Response.json(
      { error: "Check your role, organization, affiliation email, and end date." },
      { status: 400 },
    );
  }

  const [networkLimit, userLimit, emailLimit] = await Promise.all([
    enforceRateLimit(
      { scope: "affiliation-network", limit: 20, windowMs: 60 * 60 * 1_000 },
      requestNetworkIdentifier(request),
    ),
    enforceRateLimit(
      { scope: "affiliation-user", limit: 5, windowMs: 60 * 60 * 1_000 },
      String(user.id),
    ),
    enforceRateLimit(
      { scope: "affiliation-email", limit: 5, windowMs: 60 * 60 * 1_000 },
      input.data.affiliationEmail,
    ),
  ]);
  if (!networkLimit.allowed) return rateLimitResponse(networkLimit);
  if (!userLimit.allowed) return rateLimitResponse(userLimit);
  if (!emailLimit.allowed) return rateLimitResponse(emailLimit);

  const result = await startAffiliationVerification(user, input.data);
  if (result.kind === "already_verified") {
    return Response.json({ error: "Your current affiliation is already verified." }, { status: 409 });
  }
  if (result.kind === "organization_not_found") {
    return Response.json({ error: "That organization is no longer available." }, { status: 404 });
  }
  if (result.kind === "invalid_end_date") {
    return Response.json({ error: "The internship end date must be in the future." }, { status: 400 });
  }
  if (result.kind === "manual_review") {
    logOperationalInfo("affiliation.review.queued", {
      userId: user.id,
      verificationId: result.verificationId,
    });
    return Response.json({
      status: "pending_review",
      message: isPublicBeta()
        ? "Your affiliation is queued for manual review. Check this page for the decision; email notifications are unavailable during the public beta."
        : "Your organization or email domain needs administrator review.",
    }, { status: 202 });
  }

  try {
    const delivery = await sendAffiliationVerification({
      recipient: result.recipient,
      name: result.recipientName,
      organizationName: result.organizationName,
      token: result.token,
      idempotencyKey: `affiliation-verification-${result.verificationId}`,
    });
    logOperationalInfo("affiliation.email.accepted", {
      userId: user.id,
      verificationId: result.verificationId,
      provider: delivery.provider,
      providerMessageId: delivery.providerMessageId,
    });

    return Response.json({
      status: "email_pending",
      message: "Check your affiliation email for a verification link.",
      ...(delivery.previewUrl ? { verificationPreviewUrl: delivery.previewUrl } : {}),
    }, { status: 201 });
  } catch (error) {
    logOperationalError("affiliation.email.failed", {
      userId: user.id,
      verificationId: result.verificationId,
      ...emailDeliveryFailureAttributes(error),
    });
    return Response.json({
      status: "email_pending",
      message: "Your verification was created, but email delivery is temporarily unavailable.",
      emailDeliveryUnavailable: true,
    }, { status: 202 });
  }
}
