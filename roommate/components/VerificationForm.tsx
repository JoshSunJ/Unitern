"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type {
  AffiliationType,
  OrganizationOption,
} from "@/features/verification/types";

type Result = {
  status?: "email_pending" | "pending_review";
  message?: string;
  error?: string;
  verificationPreviewUrl?: string;
};

export default function VerificationForm({
  organizations,
  manualReviewOnly = false,
}: {
  organizations: OrganizationOption[];
  manualReviewOnly?: boolean;
}) {
  const [affiliationType, setAffiliationType] = useState<AffiliationType>("student");
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("other");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const visibleOrganizations = useMemo(
    () => organizations.filter((organization) => organization.type === affiliationType),
    [affiliationType, organizations],
  );

  async function submit(formData: FormData) {
    setLoading(true);
    setResult(null);

    try {
      const expectedEndDate = formData.get("expectedEndDate");
      const response = await fetch("/api/verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          affiliationType,
          organizationId: selectedOrganizationId === "other"
            ? null
            : Number(selectedOrganizationId),
          organizationName: selectedOrganizationId === "other"
            ? formData.get("organizationName")
            : "",
          affiliationEmail: formData.get("affiliationEmail"),
          expectedEndDate: affiliationType === "intern"
            && typeof expectedEndDate === "string"
            && expectedEndDate
            ? expectedEndDate
            : null,
        }),
      });
      const responseResult = await response.json();
      if (!response.ok) {
        setResult({ error: responseResult.error ?? "Could not start verification." });
        return;
      }
      setResult(responseResult);
    } catch {
      setResult({ error: "Could not reach the server. Try again." });
    } finally {
      setLoading(false);
    }
  }

  if (result?.status) {
    return (
      <section className="auth-form auth-form--success" aria-live="polite">
        <h2>{result.status === "email_pending" ? "Check your affiliation email." : "Review requested."}</h2>
        <p>{result.message}</p>
        {result.verificationPreviewUrl && (
          <p>
            Local preview mode: <Link href={result.verificationPreviewUrl}>verify affiliation ↗</Link>
          </p>
        )}
        {result.status === "email_pending" && (
          <button type="button" onClick={() => setResult(null)}>
            Send a new link
          </button>
        )}
      </section>
    );
  }

  return (
    <form action={submit} className="auth-form">
      <label>
        Community role
        <select
          name="affiliationType"
          value={affiliationType}
          onChange={(event) => {
            setAffiliationType(event.target.value as AffiliationType);
            setSelectedOrganizationId("other");
          }}
        >
          <option value="student">Student</option>
          <option value="intern">Intern</option>
        </select>
      </label>
      <label>
        {affiliationType === "student" ? "University" : "Company"}
        <select
          value={selectedOrganizationId}
          onChange={(event) => setSelectedOrganizationId(event.target.value)}
        >
          <option value="other">Other—not listed</option>
          {visibleOrganizations.map((organization) => (
            <option value={organization.id} key={organization.id}>{organization.name}</option>
          ))}
        </select>
      </label>
      {selectedOrganizationId === "other" && (
        <label>
          {affiliationType === "student" ? "University name" : "Company name"}
          <input
            name="organizationName"
            required
            minLength={2}
            maxLength={120}
            placeholder={affiliationType === "student" ? "University of Chicago" : "Acme Corporation"}
          />
        </label>
      )}
      <label>
        School or company email
        <input
          name="affiliationEmail"
          type="email"
          autoComplete="email"
          required
          placeholder={affiliationType === "student" ? "you@university.edu" : "you@company.com"}
        />
      </label>
      {affiliationType === "intern" && (
        <label>
          Expected internship end date
          <input name="expectedEndDate" type="date" required />
        </label>
      )}
      <p className="auth-form__hint">
        {manualReviewOnly
          ? "Affiliations are reviewed manually during the public beta. Check this page for your review status. Do not submit passwords or identity documents."
          : "Trusted organization domains receive an automatic email link. Unknown or mismatched domains go to administrator review. Never submit passwords or identity documents here."}
      </p>
      {result?.error && <p className="form-error" role="alert">{result.error}</p>}
      <button disabled={loading}>{loading ? "Starting verification…" : manualReviewOnly ? "Request affiliation review" : "Verify affiliation"}</button>
    </form>
  );
}
