"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function GoogleSignInButton({ destination }: { destination: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className="auth-form google-sign-in">
      <button type="button" disabled={pending} onClick={async () => {
        setPending(true);
        setError("");
        try {
          await signIn("google", { redirectTo: destination });
        } catch {
          setError("Could not connect to Google. Please try again.");
          setPending(false);
        }
      }}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.97-3.38.97-2.6 0-4.81-1.76-5.6-4.13H3.05v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.92a6 6 0 0 1 0-3.84V7.49H3.05a10 10 0 0 0 0 9.02l3.35-2.59Z"/><path fill="#EA4335" d="M12 5.95c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.95 5.49l3.35 2.59c.79-2.37 3-4.13 5.6-4.13Z"/></svg>
        {pending ? "Connecting…" : "Continue with Google"}
      </button>
      <p className="auth-form__hint">Use a Gmail or Google Workspace account. Google verifies your email when you sign in.</p>
      {error && <p role="alert" className="form-error">{error}</p>}
    </section>
  );
}
