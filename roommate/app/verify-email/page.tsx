import type { Metadata } from "next";
import Link from "next/link";

import ResendVerificationForm from "@/components/ResendVerificationForm";
import { outboundEmailEnabled } from "@/features/launch/config";

export const metadata: Metadata = { title: "Verify email · Unitern", referrer: "no-referrer" };

type Props = { searchParams: Promise<{ status?: string; sent?: string; delivery?: string }> };

export default async function VerifyEmailPage({ searchParams }: Props) {
  const { status, sent, delivery } = await searchParams;
  if (!outboundEmailEnabled()) return <main className="page-shell auth-page"><h1>Sign in with Google.</h1><p>Google confirms your account email. Email verification links are unavailable during the public beta.</p><Link href="/sign-in">Continue to sign in</Link></main>;

  return (
    <main className="page-shell auth-page">
      <Link href="/" className="back-link">← Back home</Link>
      <p className="eyebrow">Account security</p>
      <h1>{status === "verified" ? "Email verified." : "Verify your email."}</h1>
      {status === "verified" ? (
        <>
          <p className="form-intro">Your address is confirmed. You can now sign in to Unitern.</p>
          <Link href="/sign-in" className="button-link">Continue to sign in</Link>
        </>
      ) : (
        <>
          <p className="form-intro">
            {status === "invalid"
              ? "That verification link is invalid, expired, or already used."
              : delivery === "unavailable"
                ? "Your account was created, but email delivery is temporarily unavailable. Try requesting another link shortly."
              : sent
                ? "We sent a single-use link that expires in 24 hours."
                : "Enter your email to request a new single-use link."}
          </p>
          <ResendVerificationForm />
        </>
      )}
    </main>
  );
}
