import { outboundEmailEnabled } from "@/features/launch/config";
import { z } from "zod";

import {
  emailDeliveryFailureAttributes,
  sendPasswordReset,
  validateEmailDeliveryConfiguration,
} from "@/features/account-email/delivery";
import { issuePasswordResetForEmail } from "@/features/password-reset/service";
import {
  enforceRateLimit,
  rateLimitResponse,
  requestNetworkIdentifier,
} from "@/features/security/rate-limit";
import { logOperationalError, logOperationalInfo } from "@/lib/operational-log";

const requestSchema = z.object({ email: z.string().trim().email() });
const PUBLIC_MESSAGE = "If that account exists, a password-reset link is on its way.";

export async function POST(request: Request) {
  if (!outboundEmailEnabled()) return Response.json({ error: "Email links are unavailable during the public beta. Sign in with Google." }, { status: 503 });
  validateEmailDeliveryConfiguration();
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const [networkLimit, emailLimit] = await Promise.all([
    enforceRateLimit(
      { scope: "password-reset-network", limit: 10, windowMs: 60 * 60 * 1000 },
      requestNetworkIdentifier(request),
    ),
    enforceRateLimit(
      { scope: "password-reset-address", limit: 3, windowMs: 60 * 60 * 1000 },
      email,
    ),
  ]);
  if (!networkLimit.allowed) return rateLimitResponse(networkLimit);
  if (!emailLimit.allowed) return rateLimitResponse(emailLimit);

  const reset = await issuePasswordResetForEmail(email);
  if (!reset) return Response.json({ message: PUBLIC_MESSAGE });

  try {
    const delivery = await sendPasswordReset({
      recipient: reset.recipient,
      name: reset.name,
      token: reset.token,
      idempotencyKey: `password-reset-${reset.id}`,
    });
    logOperationalInfo("email.password_reset.accepted", {
      provider: delivery.provider,
      providerMessageId: delivery.providerMessageId,
    });

    return Response.json({
      message: PUBLIC_MESSAGE,
      ...(delivery.previewUrl ? { passwordResetPreviewUrl: delivery.previewUrl } : {}),
    });
  } catch (error) {
    logOperationalError("email.password_reset.failed", {
      ...emailDeliveryFailureAttributes(error),
    });
    // Keep provider availability and account existence out of the public response.
    return Response.json({ message: PUBLIC_MESSAGE });
  }
}
