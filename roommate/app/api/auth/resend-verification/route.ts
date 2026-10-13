import { outboundEmailEnabled } from "@/features/launch/config";
import { z } from "zod";

import prisma from "@/lib/prisma";
import {
  emailDeliveryFailureAttributes,
  sendEmailVerification,
} from "@/features/account-email/delivery";
import {
  canResendEmailVerification,
  issueEmailVerification,
} from "@/features/account-email/service";
import {
  enforceRateLimit,
  rateLimitResponse,
  requestNetworkIdentifier,
} from "@/features/security/rate-limit";
import { logOperationalError, logOperationalInfo } from "@/lib/operational-log";

const requestSchema = z.object({ email: z.string().trim().email() });
const genericResult = {
  message: "If this account exists and still needs verification, a new link will be sent.",
};

export async function POST(request: Request) {
  if (!outboundEmailEnabled()) return Response.json({ error: "Email links are unavailable during the public beta. Sign in with Google." }, { status: 503 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json(genericResult);

  const email = parsed.data.email.toLowerCase();
  const [networkLimit, emailLimit] = await Promise.all([
    enforceRateLimit(
      { scope: "verify-email-network", limit: 10, windowMs: 60 * 60 * 1000 },
      requestNetworkIdentifier(request),
    ),
    enforceRateLimit(
      { scope: "verify-email-address", limit: 3, windowMs: 60 * 60 * 1000 },
      email,
    ),
  ]);
  if (!networkLimit.allowed) return rateLimitResponse(networkLimit);
  if (!emailLimit.allowed) return rateLimitResponse(emailLimit);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, emailVerifiedAt: true },
  });

  if (!user || user.emailVerifiedAt || !await canResendEmailVerification(user.id)) {
    return Response.json(genericResult);
  }

  const verification = await issueEmailVerification(user.id);
  try {
    const delivery = await sendEmailVerification({
      recipient: user.email,
      name: user.name,
      token: verification.token,
      idempotencyKey: `email-verification-${verification.id}`,
    });
    logOperationalInfo("email.verification.accepted", {
      userId: user.id,
      provider: delivery.provider,
      providerMessageId: delivery.providerMessageId,
      source: "resend",
    });

    return Response.json({
      ...genericResult,
      ...(delivery.previewUrl ? { verificationPreviewUrl: delivery.previewUrl } : {}),
    });
  } catch (error) {
    logOperationalError("email.verification.failed", {
      userId: user.id,
      source: "resend",
      ...emailDeliveryFailureAttributes(error),
    });
    return Response.json(genericResult, { status: 202 });
  }
}
