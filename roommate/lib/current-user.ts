import { auth } from "@/auth";
import prisma from "@/lib/prisma";

export type CurrentUser = {
  id: number;
  name: string;
  email: string;
  affiliationType: string | null;
  affiliationName: string | null;
  affiliationVerificationMethod: string | null;
  affiliationExpiresAt: Date | null;
  verificationStatus: "unverified" | "submitted" | "verified" | "rejected" | "expired";
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  const userId = Number(session?.user?.id);

  if (!Number.isInteger(userId) || userId < 1) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return null;
  }

  const verificationStatus = user.verificationStatus === "verified"
    && user.affiliationExpiresAt
    && user.affiliationExpiresAt <= new Date()
    ? "expired"
    : user.verificationStatus as CurrentUser["verificationStatus"];

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    affiliationType: user.affiliationType,
    affiliationName: user.affiliationName,
    affiliationVerificationMethod: user.affiliationVerificationMethod,
    affiliationExpiresAt: user.affiliationExpiresAt,
    verificationStatus,
  };
}

export function isVerifiedUser(user: CurrentUser): boolean {
  return user.verificationStatus === "verified";
}
