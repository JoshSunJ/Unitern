import prisma from "@/lib/prisma";
import { verifiedGoogleIdentity } from "./profile";

export async function resolveGoogleUser(profile: unknown, now = new Date()) {
  const identity = verifiedGoogleIdentity(profile);
  if (!identity) return null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async (transaction) => {
        const linked = await transaction.user.findUnique({ where: { googleSubject: identity.subject } });
        const sameEmail = await transaction.user.findUnique({ where: { email: identity.email } });
        if (linked && sameEmail && linked.id !== sameEmail.id) return null;
        if (sameEmail?.googleSubject && sameEmail.googleSubject !== identity.subject) return null;

        const existing = linked ?? sameEmail;
        if (!existing) {
          return transaction.user.create({ data: {
            name: identity.name,
            email: identity.email,
            emailVerifiedAt: now,
            googleSubject: identity.subject,
          } });
        }

        const claimedUnverifiedAccount = !existing.emailVerifiedAt;
        const changedEmail = existing.email !== identity.email;
        if (claimedUnverifiedAccount || changedEmail) {
          await transaction.emailVerificationToken.deleteMany({ where: { userId: existing.id } });
          await transaction.passwordResetToken.deleteMany({ where: { userId: existing.id } });
        }
        return transaction.user.update({
          where: { id: existing.id },
          data: {
            googleSubject: identity.subject,
            email: identity.email,
            emailVerifiedAt: existing.emailVerifiedAt ?? now,
            // Never retain a password set by an unverified signup: that may
            // have been registered by someone other than the Google owner.
            ...(claimedUnverifiedAccount ? { passwordHash: null, name: identity.name } : {}),
            ...(claimedUnverifiedAccount || changedEmail ? { sessionVersion: { increment: 1 } } : {}),
          },
        });
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      if (attempt < 2 && (code === "P2034" || code === "P2002")) continue;
      throw error;
    }
  }
  return null;
}
