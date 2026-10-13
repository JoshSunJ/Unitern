import Link from "next/link";
import SignInForm from "@/components/SignInForm";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import { googleSignInEnabled, safeSignInDestination } from "@/features/google-auth/config";
import { isPublicBeta } from "@/features/launch/config";

type Props = { searchParams: Promise<{ reset?: string; next?: string; error?: string }> };

export default async function SignInPage({ searchParams }: Props) {
  const { reset, next, error } = await searchParams;
  const destination = safeSignInDestination(next);

  return (
    <main className="page-shell auth-page">
      <Link href="/" className="back-link">← Back home</Link>
      <p className="eyebrow">Welcome back</p>
      <h1>Sign in</h1>
      <p className="form-intro">
        {reset ? "Password changed. Sign in with your new password." : "Access your listings and post a new home."}
      </p>
      {error && <p className="form-error" role="alert">Google sign-in did not finish. Please try again with a verified Gmail or Google Workspace account.</p>}
      {googleSignInEnabled() && <GoogleSignInButton destination={destination} />}
      {isPublicBeta() ? <p className="form-intro">Sign in with your Gmail or Google Workspace account. School and employer affiliations are reviewed manually during the beta.</p> : <SignInForm destination={destination} />}
    </main>
  );
}
