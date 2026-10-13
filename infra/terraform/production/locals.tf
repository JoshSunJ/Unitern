locals {
  artifact_repository = "unitern"
  image_name          = "web"
  deterministic_url   = "https://${var.service_name}-${data.google_project.current.number}.${var.region}.run.app"
  application_url     = coalesce(var.app_url, local.deterministic_url)

  required_secret_environment = merge({
    DATABASE_URL         = "unitern-database-url"
    DIRECT_DATABASE_URL  = "unitern-direct-database-url"
    AUTH_SECRET          = "unitern-auth-secret"
    MAPTILER_API_KEY     = "unitern-maptiler-api-key"
    S3_ACCESS_KEY_ID     = "unitern-r2-access-key-id"
    S3_SECRET_ACCESS_KEY = "unitern-r2-secret-access-key"
  }, var.launch_mode == "public_beta" ? {} : { RESEND_API_KEY = "unitern-resend-api-key" })

  optional_secret_environment = merge(
    var.road_routing_enabled ? { MAPBOX_ACCESS_TOKEN = "unitern-mapbox-access-token" } : {},
    var.google_sign_in_enabled ? {
      AUTH_GOOGLE_ID     = "unitern-google-client-id"
      AUTH_GOOGLE_SECRET = "unitern-google-client-secret"
    } : {},
    var.housing_chat_enabled ? { GEMINI_API_KEY = "unitern-gemini-api-key" } : {},
  )

  secret_environment = merge(
    local.required_secret_environment,
    local.optional_secret_environment,
  )

  runtime_environment = {
    AUTH_URL                     = local.application_url
    ADMIN_EMAIL                  = var.admin_email
    UNITERN_LAUNCH_MODE          = var.launch_mode
    EMAIL_PROVIDER               = var.launch_mode == "public_beta" ? "disabled" : "resend"
    EMAIL_FROM                   = var.email_from
    PHOTO_STORAGE_DRIVER         = "s3"
    S3_BUCKET                    = var.r2_bucket
    S3_REGION                    = "auto"
    S3_ENDPOINT                  = var.r2_endpoint
    PHOTO_PUBLIC_BASE_URL        = var.photo_public_base_url
    UNITERN_VALIDATE_RUNTIME_ENV = "true"
  }
}
