#!/usr/bin/env bash
# Constrói a imagem do backend, publica no ECR e manda a EC2 atualizar (SSM Run Command, sem SSH).
# Sem segredos: parâmetros por variável de ambiente; credenciais AWS da sua sessão (aws configure sso).
#
#   ECR_REPOSITORY=<conta>.dkr.ecr.<região>.amazonaws.com/moneylog-backend INSTANCE_ID=i-... AWS_REGION=... \
#     scripts/deploy-backend.sh [--dry-run] [--skip-build] [--rollback] [--tag TAG]
#   scripts/deploy-backend.sh --print-trusted-proxies   # CIDRs do CloudFront para MONEYLOG_TRUSTED_PROXIES
#
# Variáveis: ECR_REPOSITORY (terraform output ecr_repository), INSTANCE_ID (backend_instance_id), AWS_REGION,
#            PLATFORM (padrão linux/amd64; use linux/arm64 se instance_type for t4g.*), TAG (padrão: SHA curto do git).
# --skip-build : não constrói; usa a tag que já está no ECR.   --rollback : volta à tag anterior registrada na instância.
# --dry-run    : mostra o que faria e não constrói, não publica e não envia comando.
# Idempotente: se a tag já existe no ECR (tags são imutáveis), não reenvia a imagem; reaplicar a mesma tag é seguro.
# A instância faz o health check e, se falhar, volta sozinha para a tag anterior (/opt/moneylog/deploy.sh).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DRY_RUN=false
SKIP_BUILD=false
ROLLBACK=false
TAG="${TAG:-}"
PLATFORM="${PLATFORM:-linux/amd64}"

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=true ;;
    --skip-build) SKIP_BUILD=true ;;
    --rollback) ROLLBACK=true ;;
    --tag) TAG="${2:?--tag exige um valor}"; shift ;;
    --print-trusted-proxies)
      curl -fsS https://ip-ranges.amazonaws.com/ip-ranges.json | python3 -I -c '
import json, sys
d = json.load(sys.stdin)
cidrs = [p["ip_prefix"] for p in d["prefixes"] if p["service"] == "CLOUDFRONT_ORIGIN_FACING"]
cidrs += [p["ipv6_prefix"] for p in d["ipv6_prefixes"] if p["service"] == "CLOUDFRONT_ORIGIN_FACING"]
print(",".join(cidrs))'
      exit 0 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "argumento desconhecido: $1" >&2; exit 64 ;;
  esac
  shift
done

: "${INSTANCE_ID:?defina INSTANCE_ID (terraform output backend_instance_id)}"
: "${AWS_REGION:?defina AWS_REGION}"
export AWS_DEFAULT_REGION="$AWS_REGION"

run() {
  if [ "$DRY_RUN" = true ]; then echo "(dryrun) $*"; else "$@"; fi
}

if [ "$ROLLBACK" = true ]; then
  REMOTE="/opt/moneylog/deploy.sh --rollback"
else
  : "${ECR_REPOSITORY:?defina ECR_REPOSITORY (terraform output ecr_repository)}"
  TAG="${TAG:-$(git -C "$ROOT" rev-parse --short=12 HEAD)}"
  REGISTRY="${ECR_REPOSITORY%%/*}"
  IMAGE="$ECR_REPOSITORY:$TAG"
  REMOTE="/opt/moneylog/deploy.sh $TAG"

  if [ "$SKIP_BUILD" = false ]; then
    if [ "$DRY_RUN" = false ] && aws ecr describe-images --repository-name "${ECR_REPOSITORY#*/}" \
        --image-ids imageTag="$TAG" >/dev/null 2>&1; then
      echo "==> a tag $TAG já existe no ECR (imutável): não reenvia"
    else
      echo "==> construindo $IMAGE ($PLATFORM)"
      if [ "$DRY_RUN" = false ]; then
        aws ecr get-login-password | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null
      fi
      run docker buildx build --platform "$PLATFORM" -t "$IMAGE" --push "$ROOT/backend"
    fi
  fi
fi

echo "==> enviando para $INSTANCE_ID: $REMOTE"
if [ "$DRY_RUN" = true ]; then
  echo "(dryrun) aws ssm send-command --instance-ids $INSTANCE_ID --document-name AWS-RunShellScript"
  exit 0
fi

CMD_ID="$(aws ssm send-command --instance-ids "$INSTANCE_ID" --document-name AWS-RunShellScript \
  --comment "moneylog deploy" --parameters "commands=[\"$REMOTE\"]" \
  --query Command.CommandId --output text)"

# `wait` devolve erro se o comando falhar; ainda assim queremos ler a saída antes de sair.
STATUS=0
aws ssm wait command-executed --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" || STATUS=$?
aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" \
  --query '[Status,StandardOutputContent,StandardErrorContent]' --output text || true

if [ "$STATUS" -ne 0 ]; then
  echo "deploy falhou (a instância tenta voltar à tag anterior sozinha; confira o resultado acima)" >&2
  exit 1
fi
echo "deploy concluído. Confirme: abra o app e veja os logs no CloudWatch (grupo /moneylog/<ambiente>/backend)."
