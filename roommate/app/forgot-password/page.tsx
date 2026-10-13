import type { Metadata } from "next";
import Link from "next/link";

import ForgotPasswordForm from "@/components/ForgotPasswordForm";
import { outboundEmailEnabled } from "@/features/launch/config";

export const metadata: Metadata = { title: "Forgot password · Unitern" };

export default function ForgotPasswordPage() {
  return (
    <main className="page-shell auth-page">
      <Link href="/sign-in" className="back-link">← Back to sign in</Link>
      <p className="eyebrow">Account recovery</p>
      <h1>Reset your password.</h1>
      {outboundEmailEnabled() ? <><p className="form-intro">We will send a single-use link that expires in one hour.</p><ForgotPasswordForm /></> : <p className="form-intro">Email password recovery is unavailable during the public beta. <Link href="/sign-in">Continue with Google</Link> to access your account.</p>}
    </main>
  );
}
