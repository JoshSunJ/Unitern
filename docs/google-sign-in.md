# Google account sign-in

Unitern uses Auth.js Google OIDC with PKCE, state, and nonce. Only `openid`,
`email`, and `profile` are requested; there is no access to Gmail messages.

## Configuration

1. Configure Google Auth Platform in the environment's Google Cloud project.
   Use an external audience for personal Gmail and Workspace accounts.
2. Create a Web application OAuth client. Its authorized redirect URI must be
   exactly `${AUTH_URL}/api/auth/callback/google`. Use one canonical origin for
   the browser entry point, `AUTH_URL`, and Google's callback registration.
3. Store the client ID and client secret as versions of
   `unitern-google-client-id` and `unitern-google-client-secret` in Secret
   Manager. Never commit the secret or prefix either value with `NEXT_PUBLIC_`.
4. Set Terraform `google_sign_in_enabled = true` and `app_url` to the canonical
   origin. Terraform grants only the existing runtime identity read access.
5. Deploy the additive migration and application through the staging release.
   Keep public audience status in Testing until the first real account journey
   succeeds; publish in Google Auth Platform before opening access to everyone.

The sign-in and signup pages display Google only when both server credentials
exist. An unmatched credential pair fails production startup validation.

## Account behavior

Google must return a verified Gmail address or verified Workspace `hd` claim.
Non-Gmail addresses without Workspace claims require independent ownership
verification and are declined. The immutable Google `sub` is unique in the
database; repeated sign-ins use the same local user ID.

An authoritative Google identity can link to a matching local email account.
For an unverified registration, the old password and outstanding email/reset
tokens are removed and sessions revoked before establishing Google ownership.
A verified password account keeps its password. A different Google subject
cannot replace an existing link, and email changes cannot merge two users.

Google verifies account email only. School/employer verification and permission
to post or message remain governed by Unitern's existing affiliation checks.

## Email without an owned domain

`onboarding@resend.dev` is a test sender restricted by Resend. While it is used,
public password registration is unavailable on the signup page and API; Google
is the account creation path. Existing verified password accounts can sign in.
Reset, affiliation, and other outbound emails still need a verified sending
domain before public release. Local preview mode retains password signup tests.

## Validation

Database integration tests cover account creation, returning sign-in, unsafe
unverified registrations, verified password linking, identity/email collisions,
and concurrent first sign-ins. Browser tests inspect the protected Google
authorization request without entering credentials into a real Google account.
The release operator must also perform a real sign-in, refresh the dashboard,
sign out, sign back in, and inspect affiliation status before public launch.
