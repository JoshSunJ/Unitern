# Unitern release runbook

This runbook describes how a reviewed commit moves from GitHub to staging and
then production. It is operational documentation: follow it when creating an
environment, releasing a commit, diagnosing a failed release, or rolling back.

## Release architecture

```text
feature branch
    |
    v
pull request -- CI: test, lint, build, migrations, browser journeys, container
    |
    v
merge to master
    |
    v
staging release -- image -> database migration -> Cloud Run -> smoke tests
    |
    v
manual production release -- approval -> image -> migration -> Cloud Run -> smoke tests
```

The two thin entry workflows select the target:

- `.github/workflows/deploy-staging.yml` runs automatically after relevant code
  reaches `master`, and can also be started manually.
- `.github/workflows/deploy-production.yml` is manual so production promotion is
  an explicit decision.
- `.github/workflows/release-cloud-run.yml` contains the shared release algorithm
  so staging and production cannot quietly drift into different procedures.

Each release builds an image tagged with the Git commit SHA. A SHA is immutable:
it identifies the exact source revision instead of a moving label such as
`latest`. The workflow then applies committed Prisma migrations once, deploys
the image, and smoke-tests the URL returned by Cloud Run.

## Required isolation

Create separate resources for staging and production:

| Boundary | Staging | Production |
| --- | --- | --- |
| Google Cloud project | Dedicated staging project | Dedicated production project |
| Terraform state prefix | `unitern/staging` | `unitern/production` |
| Neon database | Disposable test-like data | Durable user data |
| R2 bucket | Staging photos | Production photos |
| Resend configuration | Safe staging sender/recipients | Verified production sender |
| MapTiler browser key | Restricted to staging origin | Restricted to production origin |
| GitHub environment | `staging` | `production` with approval when available |

This is a blast-radius boundary. Sharing a database would make a successful
staging migration capable of changing production data before release approval.

## One-time bootstrap for each environment

### 1. Prepare remote Terraform state

Apply `infra/terraform/bootstrap` once to create the private, versioned state
bucket. Use a different backend prefix for each environment even if the bucket
itself is shared.

### 2. Create the cloud foundation

From `infra/terraform/production`, copy the matching example to an untracked
`terraform.tfvars` file. Keep `deploy_application = false`, initialize the
correct backend prefix, review the plan, and apply it. This first apply creates
APIs, identities, Artifact Registry, Secret Manager containers, monitoring, and
the budget without attempting to start an application whose image and secrets
do not exist yet.

### 3. Add secret versions

Use `terraform output secret_ids` as the checklist. Add values through Google
Secret Manager; never place values in Terraform variables or GitHub variables.
The required categories are:

- pooled and direct Neon database URLs;
- a randomly generated Auth.js secret;
- Resend API key;
- server-side MapTiler key;
- Cloudflare R2 access key and secret;
- optional routing-provider token when road routing is enabled.

The Cloud Run runtime identity may read application secrets. The GitHub
deployment identity may read only database credentials because migrations are
its only reason to access application secrets.

### 4. Configure the GitHub environment

Create either `staging` or `production` in repository **Settings →
Environments**. Limit deployment branches to `master`. Add these environment
variables:

```text
GCP_PROJECT_ID
GCP_REGION
GCP_WORKLOAD_IDENTITY_PROVIDER
GCP_DEPLOY_SERVICE_ACCOUNT
CLOUD_RUN_SERVICE
NEXT_PUBLIC_MAPTILER_KEY
NEXT_PUBLIC_MAP_STYLE_URL
```

Terraform outputs the workload identity provider and deployment service account.
The validator rejects missing values, placeholder values, malformed Google
resource names, and releases started from a non-`master` branch before cloud
authentication begins.

The release job installs its locked Node.js toolchain with package lifecycle
scripts disabled before this validation. Prisma generation runs only after the
migration credentials have been loaded. This ordering prevents dependency
installation from touching the database boundary or hiding a configuration
error behind an unrelated post-install failure.

`NEXT_PUBLIC_*` values are intentionally browser-visible build inputs. Restrict
the MapTiler key by allowed HTTP origin; do not mistake a public browser key for
a server secret.

For production, add a required reviewer and disable self-review if the repository
plan and team structure support it. Approval gates deployment; it does not merge
pull requests or replace code review.

### 5. Perform the first release

Merge the workflow and infrastructure changes to `master`. The staging workflow
will run and either deploy successfully or fail with the first missing external
configuration item. After the first image exists, set `container_image` to its
full SHA-tagged Artifact Registry reference, set `deploy_application = true`,
and apply Terraform again so Terraform begins owning the Cloud Run service
configuration. Subsequent release workflows update only its image.

## Normal release procedure

1. Open a focused pull request.
2. Wait for every required CI job to pass.
3. Review the code and migrations, then merge to `master`.
4. Watch **Deploy staging**. Do not promote while its migration, deployment, or
   smoke-test step is red.
5. Exercise the changed user journey on the staging URL.
6. From GitHub Actions, run **Deploy production** against `master`.
7. Approve the production environment when prompted.
8. Confirm the production smoke test and deployment URL are green.

GitHub environment concurrency permits only one release to a target at a time.
The workflow does not cancel an in-progress database migration when a newer
commit arrives.

## What each failure means

| Failed step | Likely boundary | First response |
| --- | --- | --- |
| Validate release target | GitHub environment variables or wrong branch | Correct the named variable or rerun from `master` |
| Authenticate | Workload Identity Federation/IAM | Compare GitHub variables with Terraform outputs and provider condition |
| Push image | Artifact Registry/IAM | Check repository region and deployment writer role |
| Load database credentials | Secret Manager/IAM | Add current secret versions and deployment accessor binding |
| Validate database | Unsafe/local/malformed URL | Correct the target; never bypass this guard |
| Apply migrations | Schema or database connectivity | Inspect Prisma error; fix forward with a reviewed migration |
| Promote image | Cloud Run service/IAM/configuration | Inspect Cloud Run revision and deploy action logs |
| Smoke test | Running application or dependency | Check the failing URL, readiness response, and Cloud Run logs |

A failed smoke test means the deployment happened but the release is unhealthy.
Treat it as an incident: stop promotion, diagnose, and roll back if users are
affected.

## Rollback

Cloud Run retains earlier revisions. For an application-only regression, route
traffic back to the last healthy revision, then fix forward through a new pull
request. Record the bad and restored Git SHAs.

Database rollback is different: destructive down-migrations can lose data and
are not automatic. Production schema changes should be backward-compatible
(`expand → migrate/backfill → contract`) so the previous application revision
can still run after a new migration. When a migration causes an incident, prefer
a reviewed corrective migration or database restore procedure over improvising
SQL in production.

## Definition of release-ready

A commit is eligible for production only when:

- all pull-request CI checks passed;
- staging deployed the same commit successfully;
- staging smoke tests and the changed user journey passed;
- migrations were reviewed for backward compatibility;
- production environment configuration is complete;
- an operator is available to observe the production release and respond to a
  failure.

## Public beta without an owned email domain

Use `terraform.public-beta.tfvars.example` for the explicitly authorized beta.
`launch_mode = "public_beta"` sets `UNITERN_LAUNCH_MODE=public_beta` and
`EMAIL_PROVIDER=disabled`, requires Google OAuth credentials, and omits the
Resend secret. The same immutable application image supports full staging and
beta production; these flags are evaluated at request time.

Google sign-in confirms the account email. Every school or employer submission,
including a trusted domain, instead enters administrator review. The beta never
creates an affiliation email token or grants verified affiliation automatically.
Administrators review the queue at `/admin/verifications` after independently
checking the applicant's affiliation. Users check `/verify` and `/inquiries` for
decisions and messages; no email notifications are sent. Password sign-in,
registration and email-link recovery are unavailable in this mode.

Create a fresh production database and photo bucket. Apply migrations, which
include the organization directory, without running `db:seed` or copying
staging users and demo listings. Keep the Google client restricted to the live
origin and its `/api/auth/callback/google` redirect. Publish an external audience
with only OpenID, email and profile scopes. Restrict separate MapTiler keys to
the production origin and store backend credentials in Secret Manager.

Without an owned photo domain, set `photo_public_base_url` to the live origin
plus `/api/photos` and keep the R2 bucket private. The app serves only validated
image filenames under the `listings/` namespace, with size/type checks and
browser caching. This avoids relying on Cloudflare's development-only public
URL. Run `photos:validate:production` after deployment to verify upload, read
through the live app, and removal using a disposable image probe.

Use zero minimum Cloud Run instances, a single maximum instance and the smallest
Neon compute with idle suspension. Disable recurring database uptime checks for
this beta so they do not keep the free database awake. Startup readiness and
process liveness probes remain enabled. Billing budget alerts are notifications,
not a hard spending cap. Optional Gemini must continue using a billing-disabled
project with the application's request limits and consent notice.

CI runs the normal browser journeys and separate `test:e2e:beta` journeys. Before
public handoff, confirm Google sign-in, pending manual review, posting gates,
maps, durable photo storage, health checks and empty production marketplace
data. To enable a full email-supported launch later, verify an owned sender
domain, populate the Resend secret, test delivery, then explicitly change
`launch_mode` to `full` and review the resulting plan.

This pipeline reduces risk; it does not make the application “bug-proof.” Tests,
reviews, isolated staging, health probes, monitoring, logs, backups, and rollback
each catch or contain a different class of failure.
