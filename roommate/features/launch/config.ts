type Environment = Record<string, string | undefined>;

export function isPublicBeta(environment: Environment = process.env) {
  return environment.UNITERN_LAUNCH_MODE === "public_beta";
}

export function outboundEmailEnabled(environment: Environment = process.env) {
  return environment.EMAIL_PROVIDER !== "disabled";
}
