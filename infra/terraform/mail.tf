locals {
  mail_enabled      = var.mail_domain != ""
  mail_from_domain  = "${var.mail_from_subdomain}.${var.mail_domain}"
  mail_identity_arn = local.mail_enabled ? "arn:aws:ses:${var.mail_region}:${data.aws_caller_identity.current.account_id}:identity/${var.mail_domain}" : ""
}

resource "aws_sesv2_email_identity" "domain" {
  provider       = aws.ses
  count          = local.mail_enabled ? 1 : 0
  email_identity = var.mail_domain

  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }
}

resource "aws_sesv2_email_identity_mail_from_attributes" "domain" {
  provider               = aws.ses
  count                  = local.mail_enabled ? 1 : 0
  email_identity         = aws_sesv2_email_identity.domain[0].email_identity
  mail_from_domain       = local.mail_from_domain
  behavior_on_mx_failure = "REJECT_MESSAGE"
}

resource "aws_sns_topic" "mail_events" {
  provider = aws.ses
  count    = local.mail_enabled ? 1 : 0
  name     = "moneylog-${var.environment}-mail-events"
}

data "aws_iam_policy_document" "mail_events_topic" {
  count = local.mail_enabled ? 1 : 0

  statement {
    sid       = "AllowSesPublish"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.mail_events[0].arn]

    principals {
      type        = "Service"
      identifiers = ["ses.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "ArnLike"
      variable = "AWS:SourceArn"
      values   = ["arn:aws:ses:${var.mail_region}:${data.aws_caller_identity.current.account_id}:configuration-set/moneylog-${var.environment}"]
    }
  }
}

resource "aws_sns_topic_policy" "mail_events" {
  provider = aws.ses
  count    = local.mail_enabled ? 1 : 0
  arn      = aws_sns_topic.mail_events[0].arn
  policy   = data.aws_iam_policy_document.mail_events_topic[0].json
}

resource "aws_sns_topic_subscription" "mail_events_email" {
  provider  = aws.ses
  count     = local.mail_enabled && var.mail_alert_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.mail_events[0].arn
  protocol  = "email"
  endpoint  = var.mail_alert_email
}

resource "aws_sesv2_configuration_set" "main" {
  provider               = aws.ses
  count                  = local.mail_enabled ? 1 : 0
  configuration_set_name = "moneylog-${var.environment}"

  delivery_options {
    tls_policy = "REQUIRE"
  }

  reputation_options {
    reputation_metrics_enabled = true
  }

  sending_options {
    sending_enabled = true
  }

  suppression_options {
    suppressed_reasons = ["BOUNCE", "COMPLAINT"]
  }
}

resource "aws_sesv2_configuration_set_event_destination" "bounces" {
  provider               = aws.ses
  count                  = local.mail_enabled ? 1 : 0
  configuration_set_name = aws_sesv2_configuration_set.main[0].configuration_set_name
  event_destination_name = "bounces-and-complaints"

  event_destination {
    enabled              = true
    matching_event_types = ["BOUNCE", "COMPLAINT", "REJECT"]

    sns_destination {
      topic_arn = aws_sns_topic.mail_events[0].arn
    }
  }

  depends_on = [aws_sns_topic_policy.mail_events]
}

data "aws_iam_policy_document" "mail_send" {
  count = local.mail_enabled ? 1 : 0

  statement {
    sid     = "SendInvitationFromConfiguredSenderOnly"
    actions = ["ses:SendEmail"]
    resources = [
      local.mail_identity_arn,
      "arn:aws:ses:${var.mail_region}:${data.aws_caller_identity.current.account_id}:configuration-set/moneylog-${var.environment}",
    ]

    condition {
      test     = "StringEquals"
      variable = "ses:FromAddress"
      values   = [var.mail_from_address]
    }
  }
}

resource "aws_iam_role_policy" "mail_send" {
  count  = local.mail_enabled ? 1 : 0
  name   = "moneylog-mail-send"
  role   = aws_iam_role.backend.id
  policy = data.aws_iam_policy_document.mail_send[0].json
}
