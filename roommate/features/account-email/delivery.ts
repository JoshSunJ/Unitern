type Environment = Record<string, string | undefined>;

type VerificationMessage = {
  recipient: string;
  name: string;
  token: string;
  idempotencyKey: string;
};

type PasswordResetMessage = {
  recipient: string;
  name: string;
  token: string;
  idempotencyKey: string;
};

type AffiliationVerificationMessage = {
  recipient: string;
  name: string;
  organizationName: string;
  token: string;
  idempotencyKey: string;
};

export type EmailDeliveryResult = {
  provider: "preview" | "resend";
  previewUrl?: string;
  providerMessageId?: string;
};

export class EmailDeliveryConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailDeliveryConfigurationError";
  }
}

export class EmailDeliveryError extends Error {
  readonly status: number;
  readonly requestId?: string;

  constructor(status: number, requestId?: string) {
    super("The email provider rejected the request.");
    this.name = "EmailDeliveryError";
    this.status = status;
    this.requestId = requestId;
  }
}

export function emailDeliveryFailureAttributes(error: unknown) {
  if (error instanceof EmailDeliveryError) {
    return {
      errorType: error.name,
      providerStatus: error.status,
      providerRequestId: error.requestId,
    };
  }
  if (error instanceof EmailDeliveryConfigurationError) {
    return { errorType: error.name };
  }
  return { errorType: "UnexpectedEmailDeliveryError" };
}

type EmailDeliveryConfiguration =
  | { provider: "disabled"; baseUrl: URL }
  | { provider: "preview"; baseUrl: URL }
  | { provider: "resend"; baseUrl: URL; apiKey: string; sender: string };

function required(value: string | undefined, name: string) {
  const normalized = value?.trim();
  if (!normalized) throw new EmailDeliveryConfigurationError(`${name} is required.`);
  return normalized;
}

function appUrl(environment: Environment) {
  const value = environment.AUTH_URL?.trim() || "http://localhost:3000";
  const url = new URL(value);
  if (environment.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new EmailDeliveryConfigurationError("AUTH_URL must use HTTPS in production.");
  }
  return url;
}

export function validateEmailDeliveryConfiguration(
  environment: Environment = process.env,
): EmailDeliveryConfiguration {
  const baseUrl = appUrl(environment);
  const provider = environment.EMAIL_PROVIDER?.trim()
    || (environment.NODE_ENV === "production" ? "" : "preview");

  if (provider === "disabled" && environment.UNITERN_LAUNCH_MODE === "public_beta") {
    return { provider, baseUrl };
  }

  if (provider === "preview") {
    if (environment.NODE_ENV === "production") {
      throw new EmailDeliveryConfigurationError("Preview email delivery is disabled in production.");
    }
    return { provider, baseUrl };
  }
  if (provider !== "resend") {
    throw new EmailDeliveryConfigurationError("EMAIL_PROVIDER must be set to resend in production.");
  }
  return {
    provider,
    baseUrl,
    apiKey: required(environment.RESEND_API_KEY, "RESEND_API_KEY"),
    sender: required(environment.EMAIL_FROM, "EMAIL_FROM"),
  };
}

export function buildEmailVerificationUrl(token: string, environment: Environment = process.env) {
  const url = new URL("/api/auth/verify-email", appUrl(environment));
  url.searchParams.set("token", token);
  return url.toString();
}

export function buildPasswordResetUrl(token: string, environment: Environment = process.env) {
  const url = new URL("/reset-password", appUrl(environment));
  url.searchParams.set("token", token);
  return url.toString();
}

export function buildAffiliationVerificationUrl(
  token: string,
  environment: Environment = process.env,
) {
  const url = new URL("/api/verification/confirm", appUrl(environment));
  url.searchParams.set("token", token);
  return url.toString();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]!);
}

export async function sendEmailVerification(
  message: VerificationMessage,
  environment: Environment = process.env,
  fetchImplementation: typeof fetch = fetch,
): Promise<EmailDeliveryResult> {
  const verificationUrl = buildEmailVerificationUrl(message.token, environment);
  const configuration = validateEmailDeliveryConfiguration(environment);

  if (configuration.provider === "disabled") throw new EmailDeliveryConfigurationError("Email delivery is unavailable during the public beta.");

  if (configuration.provider === "preview") {
    return { provider: "preview", previewUrl: verificationUrl };
  }
  const safeName = escapeHtml(message.name);
  const safeUrl = escapeHtml(verificationUrl);
  const response = await fetchImplementation("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${configuration.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": message.idempotencyKey,
      "User-Agent": "Unitern/1.0",
    },
    body: JSON.stringify({
      from: configuration.sender,
      to: [message.recipient],
      subject: "Verify your Unitern email",
      text: `Hi ${message.name}, verify your Unitern email within 24 hours: ${verificationUrl}`,
      html: `<p>Hi ${safeName},</p><p>Verify your Unitern email within 24 hours.</p><p><a href="${safeUrl}">Verify email</a></p>`,
    }),
  });

  if (!response.ok) {
    throw new EmailDeliveryError(
      response.status,
      response.headers.get("x-request-id") ?? undefined,
    );
  }

  const payload = await response.json().catch(() => null) as { id?: unknown } | null;
  return {
    provider: "resend",
    ...(typeof payload?.id === "string" ? { providerMessageId: payload.id } : {}),
  };
}

export async function sendPasswordReset(
  message: PasswordResetMessage,
  environment: Environment = process.env,
  fetchImplementation: typeof fetch = fetch,
): Promise<EmailDeliveryResult> {
  const resetUrl = buildPasswordResetUrl(message.token, environment);
  const configuration = validateEmailDeliveryConfiguration(environment);

  if (configuration.provider === "disabled") throw new EmailDeliveryConfigurationError("Email delivery is unavailable during the public beta.");

  if (configuration.provider === "preview") {
    return { provider: "preview", previewUrl: resetUrl };
  }

  const safeName = escapeHtml(message.name);
  const safeUrl = escapeHtml(resetUrl);
  const response = await fetchImplementation("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${configuration.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": message.idempotencyKey,
      "User-Agent": "Unitern/1.0",
    },
    body: JSON.stringify({
      from: configuration.sender,
      to: [message.recipient],
      subject: "Reset your Unitern password",
      text: `Hi ${message.name}, reset your Unitern password within 1 hour: ${resetUrl}`,
      html: `<p>Hi ${safeName},</p><p>Reset your Unitern password within 1 hour.</p><p><a href="${safeUrl}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`,
    }),
  });

  if (!response.ok) {
    throw new EmailDeliveryError(
      response.status,
      response.headers.get("x-request-id") ?? undefined,
    );
  }

  const payload = await response.json().catch(() => null) as { id?: unknown } | null;
  return {
    provider: "resend",
    ...(typeof payload?.id === "string" ? { providerMessageId: payload.id } : {}),
  };
}

export async function sendAffiliationVerification(
  message: AffiliationVerificationMessage,
  environment: Environment = process.env,
  fetchImplementation: typeof fetch = fetch,
): Promise<EmailDeliveryResult> {
  const verificationUrl = buildAffiliationVerificationUrl(message.token, environment);
  const configuration = validateEmailDeliveryConfiguration(environment);

  if (configuration.provider === "disabled") throw new EmailDeliveryConfigurationError("Email delivery is unavailable during the public beta.");

  if (configuration.provider === "preview") {
    return { provider: "preview", previewUrl: verificationUrl };
  }

  const safeName = escapeHtml(message.name);
  const safeOrganization = escapeHtml(message.organizationName);
  const safeUrl = escapeHtml(verificationUrl);
  const response = await fetchImplementation("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${configuration.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": message.idempotencyKey,
      "User-Agent": "Unitern/1.0",
    },
    body: JSON.stringify({
      from: configuration.sender,
      to: [message.recipient],
      subject: `Verify your ${message.organizationName} affiliation`,
      text: `Hi ${message.name}, verify your ${message.organizationName} affiliation for Unitern within 24 hours: ${verificationUrl}`,
      html: `<p>Hi ${safeName},</p><p>Verify your ${safeOrganization} affiliation for Unitern within 24 hours.</p><p><a href="${safeUrl}">Verify affiliation</a></p><p>If you did not request this, you can ignore this email.</p>`,
    }),
  });

  if (!response.ok) {
    throw new EmailDeliveryError(
      response.status,
      response.headers.get("x-request-id") ?? undefined,
    );
  }

  const payload = await response.json().catch(() => null) as { id?: unknown } | null;
  return {
    provider: "resend",
    ...(typeof payload?.id === "string" ? { providerMessageId: payload.id } : {}),
  };
}
