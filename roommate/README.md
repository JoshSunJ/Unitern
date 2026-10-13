# Learning Memo

The key idea is that each step should leave you with a working application. Professional teams try to avoid building five unfinished systems at once. Build a small vertical slice
## page vs. layout files
Next.js uses folder-based routing. When you put a layout.tsx and a page.tsx in the same directory, Next.js automatically wraps the page inside the layout by passing the page content through the layout's children prop

## Structure(this is pasted from another deleted MD file)
browser
|
React Page
|
UserCard Component
|
API Request
|
API Route
|
Service Layer
|
Database

## Ideas and implementation plans:

user Destination input(type in preference)that doens't exist yet, add later.
Don’t add it yet. Keeping version one constrained to known destinations makes the next UI much easier to build and test.

## Local database

Listings are now stored in PostgreSQL rather than an in-memory array.

1. Start Docker Desktop.
2. Run `npm run db:up` to start the project database on port 5433.
3. Run `npm run db:migrate -- --name <descriptive_change>` after changing the Prisma schema.
4. Run `npm run db:seed` to reset the database to the three starter listings.
5. Run `npm run db:studio` to inspect the records in a browser.

The real connection string stays in `.env`, which Git ignores. `.env.example` documents the required local value.

## Production database release process

Unitern uses the same PostgreSQL schema in every environment, but it uses
different database instances and credentials:

```text
Local development  -> Docker PostgreSQL on localhost
CI                  -> Temporary PostgreSQL service for each workflow run
Production          -> Managed PostgreSQL with TLS and backups
```

Configure these server-only production variables in the deployment platform,
not in a committed file:

```text
DATABASE_URL         # application traffic; use a pooled URL when provided
DIRECT_DATABASE_URL  # migration traffic; use the provider's direct URL
```

Some providers support Prisma migrations over their pooled URL. In that case,
`DIRECT_DATABASE_URL` may be omitted and Prisma falls back to `DATABASE_URL`.

Before a production release:

1. Create an empty managed PostgreSQL database.
2. Require TLS in both connection URLs (`sslmode=require` or stricter).
3. Store the URLs as encrypted deployment secrets.
4. Run `npm run db:validate:production` to reject local or unencrypted targets.
5. Run `npm run db:deploy` from the deployment pipeline to apply committed migrations.
6. Deploy the application only after migrations succeed.
7. Verify `/api/health/ready` returns HTTP 200 with `database: "reachable"`.

`npm run db:migrate` is for development because it creates migration files and
may ask development-only questions. Production uses `npm run db:deploy`, which
only applies migrations already reviewed and committed to Git.

Do not automatically seed production. The current seed script deletes listing
data and is intentionally a local-development tool.

The health endpoint exposes only `reachable` or `unreachable`; it never returns
the database hostname, credentials, query error, or provider response.

## Production runtime

Unitern ships as a portable Next.js standalone container. This keeps the
application independent from one cloud vendor: the same image can run behind a
managed HTTPS load balancer on AWS App Runner/ECS, Google Cloud Run, Fly.io,
Railway, or a comparable container platform.

The release has two deliberately separate phases:

```text
Release runner                       Application runtime
npm ci                               node server.js
deploy:validate                      serves HTTP traffic
db:deploy                            has no Prisma migration CLI
```

Database migrations are not run from the container startup command. If several
instances start together, automatic startup migrations can race one another and
mix schema changes with normal application availability. Apply migrations once
from a trusted release runner before promoting the new image.

### Required production configuration

Set these as encrypted runtime secrets or configuration values on the hosting
platform:

```text
DATABASE_URL
DIRECT_DATABASE_URL
AUTH_SECRET
AUTH_URL
ADMIN_EMAIL
EMAIL_PROVIDER=resend
RESEND_API_KEY
EMAIL_FROM
MAPTILER_API_KEY
PHOTO_STORAGE_DRIVER=s3
S3_BUCKET
S3_REGION
S3_ENDPOINT                 # custom S3-compatible services such as R2
S3_ACCESS_KEY_ID            # omit both key values only when using an IAM role
S3_SECRET_ACCESS_KEY
PHOTO_PUBLIC_BASE_URL
```

`AUTH_URL`, `PHOTO_PUBLIC_BASE_URL`, and a custom `S3_ENDPOINT` must use HTTPS.
The database URLs must point to hosted PostgreSQL and require TLS. Run this
before every production migration:

```bash
npm ci
npm run deploy:validate
npm run db:deploy
```

The validator fails closed on placeholder authentication secrets, local or
unencrypted databases, ephemeral photo storage, incomplete S3 credentials, and
missing location-search configuration. It prints only safe operational metadata
and never echoes secret values.

### Build and run the container

`NEXT_PUBLIC_` variables are intentionally public and are embedded into the
browser bundle at build time. Pass the restricted MapTiler browser key while
building the image:

```bash
docker build \
  --build-arg NEXT_PUBLIC_MAPTILER_KEY="your-domain-restricted-public-key" \
  --tag unitern:release .
```

Supply the server-only variables through the hosting platform when the image
runs. Do not bake `.env` into the image. The container:

- runs as an unprivileged Linux user;
- starts Next.js's traced standalone server;
- validates the production environment before accepting requests;
- exposes port 3000;
- reports process liveness through `/api/health/live`;
- reports database-backed readiness through `/api/health/ready`;
- includes `sharp` for production image optimization.

GitHub CI builds the deployment image after tests, lint, migrations, and the
normal production build pass. CI proves the image can be assembled; it does not
automatically deploy or merge a pull request. Production promotion remains an
explicit reviewed action until a hosting provider and its credentials are
configured.

## Account email verification

New accounts must prove ownership of their email address before signing in.
Unitern stores only a SHA-256 token hash, expires links after 24 hours, and
deletes a token after it is used. Accounts created before this migration are
backfilled as verified so the release does not lock out existing users.

Local development defaults to `EMAIL_PROVIDER=preview`. After signup, the UI
shows the verification link directly. Unitern's structured application logs do
not include the raw token. Production proxy and access logs must also redact
query strings on verification and password-reset URLs.

Production uses Resend's server-side HTTPS API. Configure these encrypted
deployment variables:

 ```text
 AUTH_URL=https://your-production-hostname
 EMAIL_PROVIDER=resend
 RESEND_API_KEY=re_...
EMAIL_FROM=Unitern <accounts@your-verified-domain>
```

Never prefix `RESEND_API_KEY` with `NEXT_PUBLIC_`. Before deployment, run:

```bash
npm run email:validate:production
```

Resend requires the `EMAIL_FROM` domain to be verified. The registration route
 uses an idempotency key so a retried provider request does not produce duplicate
 verification messages.

## Photo storage

Local development uses `PHOTO_STORAGE_DRIVER=local` and writes listing photos
under `public/uploads/listings`. This is deliberately blocked when
`NODE_ENV=production`, because files written to a deployed application instance
can disappear during scaling or redeployment.

Production uses the S3-compatible driver. Cloudflare R2 is the recommended
provider for this project, while the same adapter also works with AWS S3 or
another compatible object store.

Required production variables:

```text
PHOTO_STORAGE_DRIVER=s3
S3_BUCKET
S3_REGION
S3_ENDPOINT            # required by R2; optional with AWS S3
S3_ACCESS_KEY_ID       # omit with an AWS IAM role
S3_SECRET_ACCESS_KEY   # omit with an AWS IAM role
PHOTO_PUBLIC_BASE_URL
```

The bucket must permit public reads through `PHOTO_PUBLIC_BASE_URL`, but write
credentials remain server-only. Never prefix storage credentials with
`NEXT_PUBLIC_`.

After configuring the real bucket and credentials, verify all three required
operations with:

```bash
npm run photos:validate:production
```

The preflight uploads a one-pixel image, reads it through the configured public
URL, and removes it again. A successful configuration check alone is not enough:
this proves that the runtime credentials can write and delete while browsers can
read through the public delivery URL.

## Release confidence and production operations

Production readiness is a chain of evidence, not a single successful browser
refresh. Unitern checks the system at five different boundaries:

```text
Unit tests          -> pure rules such as tokens, email payloads, and rate-limit responses
Integration tests   -> Prisma, PostgreSQL constraints, token replay, and atomic counters
Browser tests       -> signup, verification, sign-in, reset, and listing CRUD as a user
Production build    -> Next.js can compile and package the deployable application
Smoke tests         -> the deployed URL, security headers, pages, and database health work
```

Run the complete pre-merge gate locally with:

```bash
npm run release:check
```

CI repeats the same important boundaries on GitHub with clean dependencies and
fresh PostgreSQL databases. A green workflow makes a pull request eligible for
review; it does not automatically approve or merge the pull request.

After deploying to staging or production, validate the running system itself:

```bash
SMOKE_BASE_URL=https://staging.example.com npm run smoke:production
```

The smoke test intentionally uses read-only requests. It verifies the main
public pages, security headers, process liveness, and database-backed readiness
without creating users or listings in production.

### Email delivery diagnosis

Authentication routes emit structured JSON events such as:

```text
email.verification.accepted
email.verification.failed
email.password_reset.accepted
email.password_reset.failed
```

Successful Resend calls include the provider message ID. Failures include only
safe diagnostic fields such as provider status and provider request ID; email
addresses, reset tokens, passwords, and API keys are never logged. In
production, search the hosting platform logs by event name and then use the
provider message ID in the Resend dashboard to distinguish application failure,
provider rejection, and downstream inbox delivery problems.

`EMAIL_PROVIDER=preview` never sends real mail. Production email requires
`EMAIL_PROVIDER=resend`, a valid `RESEND_API_KEY`, an HTTPS `AUTH_URL`, and an
`EMAIL_FROM` address on a domain verified by Resend. Run
`npm run email:validate:production` before promotion and test one real mailbox in
staging before accepting users.

### Abuse protection and retention

Signup, sign-in, resend, forgotten-password, and reset endpoints share atomic
PostgreSQL rate-limit buckets. Keys are SHA-256 hashes, so raw email addresses
and network identifiers are not stored in the limiter table. Because every app
instance uses the same database, scaling horizontally does not reset limits or
create separate per-server counters.

Schedule this command once per day in the hosting platform's job scheduler:

```bash
npm run security:prune-rate-limits
```

It removes counters that expired more than 24 hours ago. The production reverse
proxy must overwrite, rather than append untrusted client values to,
`X-Forwarded-For`; otherwise no application-level IP limiter can reliably know
which address supplied the header.

### Promotion checklist

1. Open a focused pull request and require the CI workflow to pass.
2. Review schema migrations, authorization changes, and environment-variable changes.
3. Run `npm run deploy:validate` with staging secrets.
4. Apply reviewed migrations once with `npm run db:release`.
5. Deploy the immutable container image to staging.
6. Run `SMOKE_BASE_URL=<staging-url> npm run smoke:production`.
7. Run `npm run photos:validate:production` with the staging storage configuration.
8. Manually test one real signup email, password reset, photo upload, and map search.
9. Promote the same image to production, run smoke checks again, and monitor errors.

Code can be release-ready before infrastructure is provisioned. The application
is not operationally production-ready until managed PostgreSQL backups and TLS,
real Resend credentials and a verified sender domain, durable S3-compatible
photo storage, restricted MapTiler keys, HTTPS hosting, monitoring, and a tested
rollback procedure all exist outside the repository.

### City search and commute preview

The homepage city selector stores the selected city in the existing city cookie. Other-city searches return municipalities and provider-designated cities only; county and neighborhood results are excluded. Campus shortcuts currently include SJSU, UCLA, USC, SFSU, and UC Berkeley; selecting a shortcut in another city switches the city. Campus pins are approximate centers, not building entrances.

The area guide compares active mapped homes, including unsaved homes. A home matches when at least one selected mode is within the slider limit. Walking, cycling, driving, and ride share use street routes when available; transit and provider failures use clearly labeled distance/speed estimates. Changing the slider does not request new routes.

Without `MAPBOX_ACCESS_TOKEN`, a free FOSSGIS/OSRM preview is used. Requests are globally paced through database counters to at most one every 1.1 seconds, limited to 200 provider calls/day, and cached for one hour (200 entries per instance). Preview requests cover at most the first ten homes in a city; additional homes retain approximate estimates. It is not a guaranteed production routing service and does not include traffic or transit schedules. `ROAD_ROUTING_PROVIDER=disabled` disables it for offline tests. See the [provider usage policy](https://routing.openstreetmap.de/about.html).

`tsx scripts/seed-demo-listings.ts` creates or updates exactly five clearly labeled samples (three in San Jose, two in Los Angeles), without deleting other listings. It requires `SEED_TARGET=local` with a loopback database, or `SEED_TARGET=unitern-staging-507303-n7`, the canonical staging `AUTH_URL`, and `EXPECTED_DATABASE_HOST` matching the selected Neon database. The fictional owner has no login credentials or verified affiliation. Samples support browsing, saves, and commute comparisons; the UI and inquiry service disable contact.
