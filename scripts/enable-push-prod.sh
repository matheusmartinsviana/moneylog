#!/bin/bash
# Liga as notificações push em produção (rode na SUA máquina, com `!` no Claude Code ou direto no terminal).
#
#  1. gera o par de chaves VAPID (P-256) localmente, com o `crypto` do Node: nada é baixado e NENHUMA chave é impressa;
#  2. grava as três no SSM como SecureString (/moneylog/prod/MONEYLOG_PUSH_VAPID_PUBLIC|PRIVATE|SUBJECT);
#     se o par já existir, é mantido (trocar as chaves invalida todas as assinaturas de push já feitas);
#  3. publica o compose de produção (com MONEYLOG_PUSH_ENABLED=true) em s3://<artefatos>/config/docker-compose.yml.
#
# Depois, na instância (Session Manager -> `sudo -i`):  bash /root/instance-setup.sh app <TAG-ATUAL-DO-BACKEND>
# Isso relê os segredos do SSM, baixa o compose novo e recria o backend. No iPhone o push só funciona com o app
# INSTALADO na tela de início (Safari -> Compartilhar -> Adicionar à Tela de Início, iOS 16.4+); depois, em
# Configurações > Notificações, toque em ligar o push (o aviso de permissão só aparece num toque seu).
set -euo pipefail
export AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1
P=/moneylog/prod
BUCKET=moneylog-artifacts-mviana
SUBJECT=https://moneylog.mviana.tech
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE="$ROOT/infra/caddy/docker-compose.manual.yml"
[ -s "$COMPOSE" ] || { echo "não achei $COMPOSE" >&2; exit 1; }

if aws ssm get-parameter --name "$P/MONEYLOG_PUSH_VAPID_PUBLIC" >/dev/null 2>&1; then
  echo "chaves VAPID já existem no SSM: mantidas"
else
  KEYS="$(node -e '
    const { generateKeyPairSync } = require("node:crypto");
    const jwk = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ format: "jwk" });
    const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]);
    process.stdout.write(pub.toString("base64url") + " " + jwk.d);
  ')"
  PUB="${KEYS%% *}"; PRIV="${KEYS##* }"; unset KEYS
  aws ssm put-parameter --type SecureString --name "$P/MONEYLOG_PUSH_VAPID_PUBLIC" --value "$PUB" >/dev/null
  aws ssm put-parameter --type SecureString --name "$P/MONEYLOG_PUSH_VAPID_PRIVATE" --value "$PRIV" >/dev/null
  unset PUB PRIV
  echo "chaves VAPID geradas e gravadas no SSM"
fi
aws ssm put-parameter --overwrite --type SecureString --name "$P/MONEYLOG_PUSH_VAPID_SUBJECT" --value "$SUBJECT" >/dev/null
aws ssm get-parameters --names "$P/MONEYLOG_PUSH_VAPID_PUBLIC" "$P/MONEYLOG_PUSH_VAPID_PRIVATE" "$P/MONEYLOG_PUSH_VAPID_SUBJECT" \
  --query 'Parameters[].[Name,Type]' --output text

aws s3 cp "$COMPOSE" "s3://$BUCKET/config/docker-compose.yml"
echo
echo "PRONTO. Falta recriar o backend na instância:  bash /root/instance-setup.sh app <TAG>"
