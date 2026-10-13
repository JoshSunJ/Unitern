import { compare } from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { z } from "zod";

import {
  enforceRateLimit,
  requestNetworkIdentifier,
} from "@/features/security/rate-limit";
import { logOperationalInfo, logOperationalError } from "@/lib/operational-log";
import prisma from "@/lib/prisma";
import { googleSignInEnabled } from "@/features/google-auth/config";
import { isPublicBeta } from "@/features/launch/config";
import { resolveGoogleUser } from "@/features/google-auth/service";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { auth, handlers } = NextAuth({
  providers: [
    ...(googleSignInEnabled() ? [Google({ checks: ["pkce", "state", "nonce"] })] : []),
    ...(!isPublicBeta() ? [Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const parsed = credentialsSchema.safeParse(credentials);

        if (!parsed.success) {
          return null;
        }

        const email = parsed.data.email.toLowerCase();
        const [networkLimit, emailLimit] = await Promise.all([
          enforceRateLimit(
            { scope: "sign-in-network", limit: 30, windowMs: 15 * 60 * 1000 },
            requestNetworkIdentifier(request),
          ),
          enforceRateLimit(
            { scope: "sign-in-address", limit: 10, windowMs: 15 * 60 * 1000 },
            email,
          ),
        ]);
        if (!networkLimit.allowed || !emailLimit.allowed) {
          logOperationalInfo("auth.sign_in.rate_limited", {
            networkLimited: !networkLimit.allowed,
            addressLimited: !emailLimit.allowed,
          });
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user?.passwordHash || !user.emailVerifiedAt) {
          return null;
        }

        const passwordMatches = await compare(
          parsed.data.password,
          user.passwordHash,
        );

        if (!passwordMatches) {
          return null;
        }

        return {
          id: user.id.toString(),
          name: user.name,
          email: user.email,
          sessionVersion: user.sessionVersion,
        };
      },
    })] : []),
  ],
  pages: {
    signIn: "/sign-in",
    error: "/sign-in",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;
      try {
        const localUser = await resolveGoogleUser(profile);
        if (!localUser) return false;
        Object.assign(user, {
          id: String(localUser.id),
          name: localUser.name,
          email: localUser.email,
          sessionVersion: localUser.sessionVersion,
        });
        return true;
      } catch {
        logOperationalError("auth.google_sign_in.failed");
        return false;
      }
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.sessionVersion = (user as typeof user & { sessionVersion: number }).sessionVersion;
        return token;
      }

      const userId = Number(token.sub);
      const sessionVersion = token.sessionVersion;
      if (!Number.isInteger(userId) || typeof sessionVersion !== "number") {
        return null;
      }

      const currentUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { sessionVersion: true },
      });

      return currentUser?.sessionVersion === sessionVersion ? token : null;
    },
    async session({ session, token }) {
      session.user.id = token.sub!;
      return session;
    },
  },
});
