#!/usr/bin/env bash
# Cria o Environment `production` do repositório principal (só a branch main) e grava as variáveis que o deploy.yml lê.
# Idempotente. Os valores vêm do ambiente; nada real fica no repositório.
#   INSTANCE_ID=i-... ARTIFACTS_BUCKET=... DOMAIN=... AWS_DEPLOY_ROLE_ARN=arn:aws:iam::...:role/... scripts/setup-github-environment.sh
# Opcionais: AWS_REGION (us-east-1), GITHUB_REPO (matheusmartinsviana/moneylog), GITHUB_ENVIRONMENT (production),
#            EXIGIR_APROVACAO=1 (cada deploy espera o seu ok na aba Actions; sem isso o push na main publica sozinho).
set -euo pipefail

: "${INSTANCE_ID:?defina INSTANCE_ID}"
: "${ARTIFACTS_BUCKET:?defina ARTIFACTS_BUCKET}"
: "${DOMAIN:?defina DOMAIN}"
: "${AWS_DEPLOY_ROLE_ARN:?defina AWS_DEPLOY_ROLE_ARN (saída de scripts/setup-github-oidc.sh)}"
AWS_REGION="${AWS_REGION:-us-east-1}"
REPO="${GITHUB_REPO:-matheusmartinsviana/moneylog}"
ENV_NAME="${GITHUB_ENVIRONMENT:-production}"

REVIEWERS="[]"
if [ "${EXIGIR_APROVACAO:-0}" = 1 ]; then
  REVIEWERS="[{\"type\":\"User\",\"id\":$(gh api user -q .id)}]"
  echo "==> environment $ENV_NAME (aprovação obrigatória sua, só a branch main)"
else
  echo "==> environment $ENV_NAME (sem aprovação: push na main publica sozinho, só a branch main)"
fi
gh api -X PUT "/repos/$REPO/environments/$ENV_NAME" --input - >/dev/null <<JSON
{"reviewers":$REVIEWERS,"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}
JSON
if ! gh api "/repos/$REPO/environments/$ENV_NAME/deployment-branch-policies" -q '.branch_policies[].name' | grep -qx main; then
  gh api -X POST "/repos/$REPO/environments/$ENV_NAME/deployment-branch-policies" -f name=main -f type=branch >/dev/null
fi

echo "==> variáveis"
for kv in "AWS_REGION=$AWS_REGION" "INSTANCE_ID=$INSTANCE_ID" "ARTIFACTS_BUCKET=$ARTIFACTS_BUCKET" "DOMAIN=$DOMAIN" "AWS_DEPLOY_ROLE_ARN=$AWS_DEPLOY_ROLE_ARN"; do
  gh variable set "${kv%%=*}" -b "${kv#*=}" -R "$REPO" -e "$ENV_NAME"
done
gh variable list -R "$REPO" -e "$ENV_NAME"
