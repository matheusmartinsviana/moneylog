#!/usr/bin/env bash
# Avisa no Telegram o resultado de um deploy. Nunca derruba o deploy: sem token/chat, só registra no stderr e sai 0.
#   scripts/notify-deploy.sh <ok|falha> <alvo> <versão> [origem]
# Token e chat: TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID no ambiente ou, com a aws CLI, /moneylog/prod/MONEYLOG_TELEGRAM_* no SSM.
set -uo pipefail

RESULTADO="${1:-}"
ALVO="${2:-}"
VERSAO="${3:-}"
ORIGEM="${4:-$(whoami)@$(hostname -s)}"
[ -n "$RESULTADO" ] && [ -n "$ALVO" ] || { sed -n '2,4p' "$0" >&2; exit 0; }
[ "${MONEYLOG_NOTIFY:-1}" = 0 ] && exit 0

export AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
P=/moneylog/prod

from_ssm() {
  command -v aws >/dev/null || return 0
  aws ssm get-parameter --with-decryption --name "$P/$1" --query Parameter.Value --output text 2>/dev/null || true
}

TOKEN="${TELEGRAM_BOT_TOKEN:-$(from_ssm MONEYLOG_TELEGRAM_BOT_TOKEN)}"
CHAT="${TELEGRAM_CHAT_ID:-$(from_ssm MONEYLOG_TELEGRAM_CHAT_ID)}"
if [ -z "$TOKEN" ] || [ -z "$CHAT" ]; then
  echo "aviso no Telegram pulado: defina TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID ou grave no SSM com scripts/telegram-setup.sh" >&2
  exit 0
fi

case "$RESULTADO" in
  ok) ICONE="✅"; TEXTO="deploy concluído" ;;
  *) ICONE="❌"; TEXTO="deploy falhou" ;;
esac
MSG="$ICONE moneylog · $ALVO: $TEXTO
versão: ${VERSAO:-?}
origem: $ORIGEM
$(date '+%d/%m/%Y %H:%M %Z')"

curl -fsS --max-time 15 --config - -o /dev/null \
  --data-urlencode "chat_id=$CHAT" --data-urlencode "text=$MSG" --data-urlencode "disable_web_page_preview=true" <<CFG \
  || echo "não consegui avisar no Telegram (o deploy em si não foi afetado)" >&2
url = "https://api.telegram.org/bot$TOKEN/sendMessage"
CFG
exit 0
