import Link from "next/link";
import { redirect } from "next/navigation";

import Navbar from "@/components/Navbar";
import VerificationForm from "@/components/VerificationForm";
import {
  getLatestVerification,
  getOrganizationOptions,
} from "@/features/verification/service";
import { getCurrentUser } from "@/lib/current-user";
import { isPublicBeta } from "@/features/launch/config";

type PageProps = {
  searchParams: Promise<{ status?: string }>;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

export default async function VerifyPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/verify");

  const [{ status }, organizations, latest] = await Promise.all([
    searchParams,
    getOrganizationOptions(),
    getLatestVerification(user.id),
  ]);

  return (
    <>
      <Navbar />
      <main className="page-shell auth-page">
        <Link href="/" className="back-link">← Back home</Link>
        <p className="eyebrow">Community access</p>
        <h1>Verify your affiliation</h1>

        {status === "verified" && (
          <p className="inquiry-success">Affiliation email confirmed. Your verified access is active.</p>
        )}
        {status === "invalid" && (
          <p className="form-error" role="alert">That verification link is invalid, expired, or already used.</p>
        )}

        {user.verificationStatus === "verified" ? (
          <section className="owner-notice">
            <strong>Verified {user.affiliationType}</strong>
            <p>{user.affiliationName}</p>
            <p>
              Method: {user.affiliationVerificationMethod === "institution_email"
                ? "institution email"
                : "administrator review"}
              {user.affiliationExpiresAt
                ? ` · Renews by ${dateFormatter.format(user.affiliationExpiresAt)}`
                : ""}
            </p>
          </section>
        ) : latest?.status === "email_pending" ? (
          <>
            <section className="owner-notice">
              <strong>Check {latest.maskedAffiliationEmail}</strong>
              <p>Your one-time affiliation link expires after 24 hours.</p>
              <p>Submitting again invalidates the previous link.</p>
            </section>
            <VerificationForm organizations={organizations} manualReviewOnly={isPublicBeta()} />
          </>
        ) : latest?.status === "pending_review" ? (
          <section className="owner-notice">
            <strong>Administrator review pending</strong>
            <p>{latest.organizationName} · {latest.maskedAffiliationEmail}</p>
            {isPublicBeta() && <p>Check this page for the decision. Email notifications are unavailable during the public beta.</p>}
          </section>
        ) : (
          <>
            {latest?.status === "expired" && (
              <p className="owner-notice">Your previous verification expired. Submit a new affiliation to renew access.</p>
            )}
            {latest?.status === "rejected" && (
              <section className="owner-notice">
                <strong>The previous submission was not approved.</strong>
                {latest.reviewerNote && <p>Reviewer note: {latest.reviewerNote}</p>}
                <p>You can correct the details and try again.</p>
              </section>
            )}
            <VerificationForm organizations={organizations} manualReviewOnly={isPublicBeta()} />
          </>
        )}
      </main>
    </>
  );
}
