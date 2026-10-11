"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignUpForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verificationPreviewUrl, setVerificationPreviewUrl] = useState("");

  async function handleSubmit(formData: FormData) {
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          email: formData.get("email"),
          password: formData.get("password"),
        }),
      });

      if (!response.ok) {
        setError((await response.json()).error ?? "Could not create account.");
        return;
      }

      const result = await response.json();
      if (result.verificationPreviewUrl) {
        setVerificationPreviewUrl(result.verificationPreviewUrl);
        return;
      }
      router.push(result.emailDeliveryUnavailable
        ? "/verify-email?delivery=unavailable"
        : "/verify-email?sent=1");
    } catch {
      setError("Could not create your account. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (verificationPreviewUrl) {
    return (
      <section className="auth-form auth-form--success" aria-live="polite">
        <h2>Account created.</h2>
        <p>Production sends an email. Local preview mode gives you the link directly.</p>
        <Link href={verificationPreviewUrl}>Verify development account ↗</Link>
      </section>
    );
  }

  return (
    <form action={handleSubmit} className="auth-form">
      <label>Name<input name="name" autoComplete="name" required /></label>
      <label>Email<input name="email" type="email" autoComplete="email" required /></label>
      <label>Password<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
      <p className="auth-form__hint">Use at least 8 characters.</p>
      {error && <p className="form-error">{error}</p>}
      <button type="submit" disabled={isSubmitting}>{isSubmitting ? "Creating…" : "Create account"}</button>
      <p>Already have an account? <Link href="/sign-in">Sign in</Link>.</p>
    </form>
  );
}
