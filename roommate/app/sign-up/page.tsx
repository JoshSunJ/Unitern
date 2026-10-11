import Link from "next/link";
import SignUpForm from "@/components/SignUpForm";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import { googleSignInEnabled, passwordSignupEnabled, safeSignInDestination } from "@/features/google-auth/config";

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const googleEnabled = googleSignInEnabled();
  return (
    <main className="page-shell auth-page">
      <Link href="/" className="back-link">← Back home</Link>
      <p className="eyebrow">Start here</p>
      <h1>Create account</h1>
      <p className="form-intro">Create an account to post and manage your own listings.</p>
      {googleEnabled && <GoogleSignInButton destination={safeSignInDestination(next)} />}
      {passwordSignupEnabled() ? <SignUpForm /> : <p className="form-intro">{googleEnabled ? "Create your account with Google. School or employer verification is a separate step after sign-in." : "Account creation is temporarily unavailable. Please check back soon."}</p>}
      <p className="auth-form__hint">Already have an account? <Link href="/sign-in">Sign in</Link>.</p>
    </main>
  );
}
