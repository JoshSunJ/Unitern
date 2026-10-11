variable "project_id" {
  description = "Google Cloud project that owns this isolated Unitern environment."
  type        = string
}

variable "environment_name" {
  description = "Deployment environment represented by this state."
  type        = string
  default     = "production"

  validation {
    condition     = contains(["staging", "production"], var.environment_name)
    error_message = "environment_name must be staging or production."
  }
}

variable "region" {
  description = "Google Cloud region for Artifact Registry and Cloud Run."
  type        = string
  default     = "us-west1"
}

variable "service_name" {
  description = "Cloud Run service name."
  type        = string
  default     = "unitern-web"
}

variable "github_repository" {
  description = "GitHub repository in owner/name form allowed to deploy."
  type        = string
  default     = "JoshSunJ/Unitern"
}

variable "container_image" {
  description = "Immutable Artifact Registry image reference, preferably tagged with a Git SHA."
  type        = string
  default     = ""
}

variable "deploy_application" {
  description = "Create Cloud Run only after an image and every required secret version exist."
  type        = bool
  default     = false
}

variable "enable_uptime_check" {
  description = "Enable recurring database readiness checks. Defaults to production only so idle staging databases can suspend."
  type        = bool
  default     = null
}

variable "app_url" {
  description = "Optional canonical custom HTTPS origin; defaults to Cloud Run's deterministic URL."
  type        = string
  default     = null

  validation {
    condition     = var.app_url == null || can(regex("^https://", var.app_url))
    error_message = "app_url must be null or an HTTPS URL."
  }
}

variable "admin_email" {
  description = "Administrator account used for moderation access."
  type        = string
}

variable "email_from" {
  description = "Verified Resend sender, for example Unitern <accounts@unitern.app>."
  type        = string
}

variable "r2_bucket" {
  description = "Cloudflare R2 bucket used for listing photos."
  type        = string
}

variable "r2_endpoint" {
  description = "Account-specific R2 S3 API endpoint."
  type        = string

  validation {
    condition     = can(regex("^https://", var.r2_endpoint))
    error_message = "r2_endpoint must be an HTTPS URL."
  }
}

variable "photo_public_base_url" {
  description = "Public custom domain or R2 delivery URL for listing photos."
  type        = string

  validation {
    condition     = can(regex("^https://", var.photo_public_base_url))
    error_message = "photo_public_base_url must be an HTTPS URL."
  }
}

variable "road_routing_enabled" {
  description = "Expose the optional MAPBOX_ACCESS_TOKEN secret to the application."
  type        = bool
  default     = false
}

variable "google_sign_in_enabled" {
  description = "Expose the server-only Google OAuth client credentials for verified-email sign-in."
  type        = bool
  default     = false
}

variable "max_instances" {
  # Model requests have a separate shared free-tier cap in the application.
  description = "Cost guardrail for horizontally scaled Cloud Run instances."
  type        = number
  default     = 2

  validation {
    condition     = var.max_instances >= 1 && var.max_instances <= 10
    error_message = "max_instances must be between 1 and 10 for this launch environment."
  }
}

variable "housing_chat_enabled" {
  description = "Enable the server-only Gemini credential for the free housing guide. Use a project with billing disabled."
  type        = bool
  default     = false
}

variable "deletion_protection" {
  description = "Protect the Cloud Run service from accidental deletion."
  type        = bool
  default     = true
}

variable "create_budget" {
  description = "Create a Google Cloud billing budget after billing_account_id is supplied."
  type        = bool
  default     = false
}

variable "billing_account_id" {
  description = "Google Cloud billing account ID used only when create_budget is true."
  type        = string
  default     = ""
}

variable "monthly_budget_usd" {
  description = "Monthly Google Cloud budget used for alert thresholds."
  type        = number
  default     = 10
}
