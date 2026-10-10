# Alertas de custo (risco D2 §6): avisa em 50%, 80% e 100% do real e em 100% da previsão.
resource "aws_budgets_budget" "monthly" {
  name         = "moneylog-${var.environment}-mensal"
  budget_type  = "COST"
  limit_amount = tostring(var.budget_limit_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # Uso bruto: sem descontar créditos/reembolsos. Enquanto os créditos pagam a conta, o alerta mostra o ritmo em que eles acabam.
  cost_types {
    include_credit = false
    include_refund = false
  }

  dynamic "notification" {
    for_each = [50, 80, 100]
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = [var.budget_alert_email]
    }
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.budget_alert_email]
  }
}
