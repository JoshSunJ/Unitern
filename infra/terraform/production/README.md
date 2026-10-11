# Unitern launch infrastructure

This Terraform root owns Google Cloud APIs, Artifact Registry, workload
identities, Secret Manager containers, Cloud Run, the public invoker policy, an
uptime check, and a cost budget. Neon and Cloudflare R2 stay outside this state;
their credentials enter Cloud Run through Secret Manager.

Budget thresholds measure gross usage before promotional or free-trial credits.
This makes staging costs visible during a trial; the budget is an alerting
guardrail, not an automatic spending cap.

Recurring database readiness checks are enabled by default for production and
disabled for staging. A readiness request queries Neon; frequent external checks
keep its compute awake even when no users visit the app. Staging keeps Cloud
Run's startup and liveness probes, while idle database compute can suspend.
Set `enable_uptime_check = true` to opt a staging environment into continuous
availability monitoring, or `false` to disable it explicitly.

The same declarations create `staging` and `production`, but each environment
must use a separate Google Cloud project, database, R2 bucket, GitHub
environment, and Terraform state prefix. Reusing code gives both environments
the same architecture. Separating their resources prevents test data or a bad
staging migration from affecting real users.

## Why deployment starts disabled

Cloud Run validates referenced secret versions while creating a revision. The
first Terraform apply therefore creates the registry, identities, and empty
secret containers while `deploy_application = false`.

This produces a safe bootstrap sequence:

1. Initialize Terraform against the remote state bucket.
2. Apply with application deployment disabled.
3. Add one current version to every secret listed by `terraform output secret_ids`.
4. Build and push an image tagged with the Git commit SHA.
5. Set `container_image` to that immutable image and enable deployment.
6. Apply again, then run the deployed-system smoke checks.

## Initialize the remote backend

```bash
cp terraform.tfvars.example terraform.tfvars
terraform init \
  -backend-config="bucket=YOUR_STATE_BUCKET" \
  -backend-config="prefix=unitern/production"
terraform plan -out production.tfplan
terraform apply production.tfplan
```

For staging, copy `terraform.staging.tfvars.example` instead and initialize a
fresh working directory or reconfigure the backend with the distinct prefix
`unitern/staging`. Never point staging and production at the same state prefix.

The backend arguments describe where Terraform state lives; they are not normal
input variables. State is versioned in the private bucket created by the
bootstrap root.

The Google provider sets `user_project_override = true` and uses the environment
project as its billing/quota project. This is the recommended mode for local
Application Default Credentials: API quota is attributed to the project being
managed instead of the Google-owned OAuth client project. The operator therefore
needs `serviceusage.services.use` on the environment project, and the bootstrap
root enables Cloud Resource Manager before the main root reads project IAM.

## Secret handling

Terraform intentionally creates secret containers without secret versions. Do
not put secret values in `terraform.tfvars`, shell history, GitHub variables, or
Terraform resources. Add them with the Google Cloud console or a protected
one-time command, then let Cloud Run reference `latest`.

Required values are:

- pooled Neon `DATABASE_URL`;
- direct Neon `DIRECT_DATABASE_URL`;
- a random `AUTH_SECRET` of at least 32 characters;
- Resend API key;
- server-side MapTiler key;
- R2 access-key ID and secret access key;
- optional Mapbox token when road routing is enabled.

The runtime identity can read all application secrets. The protected deployment
identity can read only the pooled and direct database URLs, because its release
responsibility is limited to validating and applying migrations before
promoting a revision.

## Ownership boundary

Terraform owns service configuration, IAM, scaling, probes, and secrets. The
release workflow owns the promoted container image, revision provenance labels,
and deployment-client metadata. The Terraform lifecycle rule ignores these
release changes so a successful deployment does not cause an unnecessary new
revision on the next infrastructure apply.

## GitHub deployment variables

After each environment's first infrastructure apply, create matching `staging`
and `production` environments under **GitHub repository settings → Environments**.
Configure these non-secret variables inside each GitHub environment, not as one
shared set of repository variables:

```text
GCP_PROJECT_ID
GCP_REGION
GCP_WORKLOAD_IDENTITY_PROVIDER
GCP_DEPLOY_SERVICE_ACCOUNT
CLOUD_RUN_SERVICE
NEXT_PUBLIC_MAPTILER_KEY
NEXT_PUBLIC_MAP_STYLE_URL
```

Use the matching Terraform outputs for the provider and service-account values.
Each public MapTiler browser key must be restricted to its environment's origin.
None of these values is a private credential; Google Cloud authorization comes
from the short-lived GitHub OIDC token.

Allow deployments from `master` in both GitHub environments. Configure a
required reviewer on `production` when the repository plan supports it. Staging
deploys automatically after a merge, while production runs only through the
manual **Deploy production** workflow. See `docs/release-runbook.md` for the
complete bootstrap, release, rollback, and failure-triage procedure.
