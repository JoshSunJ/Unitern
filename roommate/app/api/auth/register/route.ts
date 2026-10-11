import { hash } from "bcryptjs";
import { z } from "zod";

import prisma from "@/lib/prisma";
import {
  emailDeliveryFailureAttributes,
  sendEmailVerification,
  validateEmailDeliveryConfiguration,
} from "@/features/account-email/delivery";
import { issueEmailVerification } from "@/features/account-email/service";
import {
  enforceRateLimit,
  rateLimitResponse,
  requestNetworkIdentifier,
} from "@/features/security/rate-limit";
import { logOperationalError, logOperationalInfo } from "@/lib/operational-log";
import { passwordSignupEnabled } from "@/features/google-auth/config";

const registrationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  if (!passwordSignupEnabled()) {
    return Response.json({ error: "Please create your account with Google while email signup is unavailable." }, { status: 503 });
  }
  validateEmailDeliveryConfiguration();
  const parsed = registrationSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return Response.json(
      { error: "Use a name, a valid email, and a password of at least 8 characters." },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase();
  const [networkLimit, emailLimit] = await Promise.all([
    enforceRateLimit(
      { scope: "register-network", limit: 10, windowMs: 60 * 60 * 1000 },
      requestNetworkIdentifier(request),
    ),
    enforceRateLimit(
      { scope: "register-email", limit: 3, windowMs: 60 * 60 * 1000 },
      email,
    ),
  ]);
  if (!networkLimit.allowed) return rateLimitResponse(networkLimit);
  if (!emailLimit.allowed) return rateLimitResponse(emailLimit);

  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser) {
    return Response.json(
      { error: "An account already exists for that email." },
      { status: 409 },
    );
  }

  const passwordHash = await hash(parsed.data.password, 12);
  const user = await prisma.user.create({
    data: { name: parsed.data.name, email, passwordHash },
  });

  const verification = await issueEmailVerification(user.id);
  let delivery;
  try {
    delivery = await sendEmailVerification({
      recipient: user.email,
      name: user.name,
      token: verification.token,
      idempotencyKey: `email-verification-${verification.id}`,
    });
    logOperationalInfo("email.verification.accepted", {
      userId: user.id,
      provider: delivery.provider,
      providerMessageId: delivery.providerMessageId,
      source: "registration",
    });
  } catch (error) {
    logOperationalError("email.verification.failed", {
      userId: user.id,
      source: "registration",
      ...emailDeliveryFailureAttributes(error),
    });
    return Response.json({
      id: user.id,
      requiresEmailVerification: true,
      emailDeliveryUnavailable: true,
    }, { status: 202 });
  }

  return Response.json(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      requiresEmailVerification: true,
      emailDeliveryUnavailable: false,
      ...(delivery.previewUrl ? { verificationPreviewUrl: delivery.previewUrl } : {}),
    },
    { status: 201 },
  );
}
