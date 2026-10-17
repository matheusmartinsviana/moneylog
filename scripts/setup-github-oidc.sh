#!/usr/bin/env bash
# Cria (ou atualiza) o provedor OIDC do GitHub e a role que o deploy.yml assume. Idempotente; nenhuma chave gerada.
#   INSTANCE_ID=i-... ARTIFACTS_BUCKET=... scripts/setup-github-oidc.sh
# Opcionais: AWS_REGION (us-east-1), GITHUB_REPO (matheusmartinsviana/moneylog), GITHUB_ENVIRONMENT (production),
#            ROLE_NAME (moneylog-github-deploy). Imprime o ARN para a variável AWS_DEPLOY_ROLE_ARN do Environment.
set -euo pipefail

: "${INSTANCE_ID:?defina INSTANCE_ID}"
: "${ARTIFACTS_BUCKET:?defina ARTIFACTS_BUCKET}"
export AWS_REGION="${AWS_REGION:-us-east-1}"
GITHUB_REPO="${GITHUB_REPO:-matheusmartinsviana/moneylog}"
GITHUB_ENVIRONMENT="${GITHUB_ENVIRONMENT:-production}"
ROLE_NAME="${ROLE_NAME:-moneylog-github-deploy}"

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
PROVIDER_ARN="arn:aws:iam::$ACCOUNT:oidc-provider/token.actions.githubusercontent.com"

if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$PROVIDER_ARN" >/dev/null 2>&1; then
  echo "==> provedor OIDC já existe"
else
  echo "==> criando o provedor OIDC do GitHub"
  aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com \
    --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 1c58a3a8518e8759bf075b76b750d4f2df264fcd >/dev/null
fi

SUBJECTS="\"repo:$GITHUB_REPO:environment:$GITHUB_ENVIRONMENT\""
if command -v gh >/dev/null; then
  IMMUTABLE_PREFIX="$(gh api "/repos/$GITHUB_REPO/actions/oidc/customization/sub" -q 'select(.use_immutable_subject == true) | .sub_claim_prefix' 2>/dev/null || true)"
  if [[ -n "$IMMUTABLE_PREFIX" ]]; then
    SUBJECTS="$SUBJECTS, \"$IMMUTABLE_PREFIX:environment:$GITHUB_ENVIRONMENT\""
    echo "==> subject imutável do GitHub incluído: $IMMUTABLE_PREFIX"
  fi
else
  echo "aviso: sem gh na máquina, a role só aceita o subject clássico; se o GitHub emitir o imutável, instale o gh e rode de novo" >&2
fi

TRUST="$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Federated": "$PROVIDER_ARN"},
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {"StringEquals": {
      "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
      "token.actions.githubusercontent.com:sub": [$SUBJECTS]
    }}
  }]
}
JSON
)"

POLICY="$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {"Sid": "EcrLogin", "Effect": "Allow", "Action": "ecr:GetAuthorizationToken", "Resource": "*"},
    {"Sid": "EcrPush", "Effect": "Allow",
     "Action": ["ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart",
                "ecr:CompleteLayerUpload", "ecr:PutImage", "ecr:BatchGetImage", "ecr:DescribeImages"],
     "Resource": "arn:aws:ecr:$AWS_REGION:$ACCOUNT:repository/moneylog-backend"},
    {"Sid": "FrontendArtifacts", "Effect": "Allow", "Action": ["s3:PutObject", "s3:GetObject"],
     "Resource": "arn:aws:s3:::$ARTIFACTS_BUCKET/frontend/*"},
    {"Sid": "RunOnInstance", "Effect": "Allow", "Action": "ssm:SendCommand",
     "Resource": ["arn:aws:ssm:$AWS_REGION::document/AWS-RunShellScript",
                  "arn:aws:ec2:$AWS_REGION:$ACCOUNT:instance/$INSTANCE_ID"]},
    {"Sid": "ReadCommandResult", "Effect": "Allow",
     "Action": ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations", "ssm:ListCommands"], "Resource": "*"}
  ]
}
JSON
)"

if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  echo "==> role $ROLE_NAME já existe: atualizando a confiança"
  aws iam update-assume-role-policy --role-name "$ROLE_NAME" --policy-document "$TRUST"
else
  echo "==> criando a role $ROLE_NAME"
  aws iam create-role --role-name "$ROLE_NAME" --assume-role-policy-document "$TRUST" \
    --max-session-duration 3600 --description "Deploy do moneylog pelo GitHub Actions (OIDC)" >/dev/null
fi
aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name deploy --policy-document "$POLICY"

ROLE_ARN="$(aws iam get-role --role-name "$ROLE_NAME" --query Role.Arn --output text)"
echo "AWS_DEPLOY_ROLE_ARN=$ROLE_ARN"
