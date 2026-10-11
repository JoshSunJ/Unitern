resource "google_monitoring_uptime_check_config" "application_readiness" {
  count = var.deploy_application && coalesce(var.enable_uptime_check, var.environment_name == "production") ? 1 : 0

  project      = var.project_id
  display_name = "Unitern ${var.environment_name} readiness"
  timeout      = "10s"
  period       = "300s"

  http_check {
    path         = "/api/health/ready"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      host       = trimsuffix(trimprefix(local.application_url, "https://"), "/")
      project_id = var.project_id
    }
  }

  depends_on = [google_project_service.required]
}
