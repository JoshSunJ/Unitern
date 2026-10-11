import { z } from "zod";

const googleProfileSchema = z.object({
  sub: z.string().min(1).max(255),
  email: z.string().email().max(320),
  email_verified: z.literal(true),
  name: z.string().trim().min(1).max(120).optional(),
  hd: z.string().min(1).optional(),
});

// Only called with the OIDC profile validated by Auth.js, never browser input.
export function verifiedGoogleIdentity(profile: unknown) {
  const parsed = googleProfileSchema.safeParse(profile);
  if (!parsed.success) return null;
  const email = parsed.data.email.trim().toLowerCase();
  const domain = email.split("@")[1];
  // Google is authoritative for Gmail and verified Workspace domains. A
  // third-party address without hd may have changed owners since registration.
  if (domain !== "gmail.com" && !parsed.data.hd) return null;
  return {
    subject: parsed.data.sub,
    email,
    name: parsed.data.name ?? email.split("@")[0],
  };
}
