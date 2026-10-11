# Deploy sem chave de longa duração: o GitHub Actions assume esta role por OIDC, só a partir do Environment aprovado.
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

data "aws_iam_policy_document" "github_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:environment:${var.github_deploy_environment}"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name               = "moneylog-${var.environment}-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_assume.json
}

data "aws_iam_policy_document" "github_deploy" {
  statement {
    sid       = "EcrLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "EcrPush"
    actions = [
      "ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload", "ecr:PutImage", "ecr:BatchGetImage",
    ]
    resources = [aws_ecr_repository.backend.arn]
  }

  dynamic "statement" {
    for_each = local.use_cloudfront ? [1] : []
    content {
      sid       = "FrontendSync"
      actions   = ["s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
      resources = [aws_s3_bucket.frontend[0].arn, "${aws_s3_bucket.frontend[0].arn}/*"]
    }
  }

  dynamic "statement" {
    for_each = local.use_cloudfront ? [1] : []
    content {
      sid       = "Invalidate"
      actions   = ["cloudfront:CreateInvalidation"]
      resources = [aws_cloudfront_distribution.app[0].arn]
    }
  }

  # Modo cloudflare: o front vai como zip para o bucket de artefatos e a EC2 o baixa por SSM.
  dynamic "statement" {
    for_each = local.use_cloudflare ? [1] : []
    content {
      sid       = "FrontendArtifacts"
      actions   = ["s3:PutObject", "s3:GetObject"]
      resources = ["${aws_s3_bucket.artifacts[0].arn}/frontend/*"]
    }
  }

  statement {
    sid     = "RunDeployCommand"
    actions = ["ssm:SendCommand"]
    resources = [
      aws_instance.backend.arn,
      "arn:aws:ssm:${var.region}::document/AWS-RunShellScript",
    ]
  }

  statement {
    sid       = "ReadCommandResult"
    actions   = ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "moneylog-deploy"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_deploy.json
}
