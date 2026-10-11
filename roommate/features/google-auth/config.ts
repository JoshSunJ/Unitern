type Environment = Record<string, string | undefined>;

export function googleSignInEnabled(environment: Environment = process.env) {
  return Boolean(environment.AUTH_GOOGLE_ID?.trim() && environment.AUTH_GOOGLE_SECRET?.trim());
}

export function passwordSignupEnabled(environment: Environment = process.env) {
  return environment.NODE_ENV !== "production" && environment.EMAIL_PROVIDER !== "resend"
    || Boolean(environment.EMAIL_FROM && !/@resend\.dev(?:>|\s|$)/i.test(environment.EMAIL_FROM));
}

export function safeSignInDestination(value: string | undefined) {
  if (!value?.startsWith("/") || value.startsWith("//") || /[\\\x00-\x20]/.test(value)) return "/dashboard";
  const destination = new URL(value, "https://unitern.invalid");
  if (destination.origin !== "https://unitern.invalid" || destination.pathname.startsWith("/api/auth")
    || ["/sign-in", "/sign-up"].includes(destination.pathname)) return "/dashboard";
  return destination.pathname + destination.search + destination.hash;
}
