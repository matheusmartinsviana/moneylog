#!/bin/bash
# Conecta um bot do Telegram ao moneylog. O token NUNCA é impresso nem passa pelo chat: vem da área de transferência
# (pbpaste) e vai direto para o SSM como SecureString.
#
#   1) No Telegram, fale com @BotFather, crie o bot (/newbot) e COPIE o token. Depois rode:  scripts/telegram-setup.sh token
#   2) Abra o seu bot no Telegram e mande /start. Depois rode:                              scripts/telegram-setup.sh chat
#   3) Para testar a qualquer momento:                                                      scripts/telegram-setup.sh test
#
# Grava /moneylog/prod/MONEYLOG_TELEGRAM_BOT_TOKEN e /moneylog/prod/MONEYLOG_TELEGRAM_CHAT_ID. Depois, na instância:
#   bash /root/instance-setup.sh app <TAG>      (relê os segredos do SSM)
set -euo pipefail
export AWS_REGION="${AWS_REGION:-us-east-1}"
P=/moneylog/prod
API=https://api.telegram.org

telegram() {
  local method="$1" token="$2"; shift 2
  curl -fsS --config - "$@" <<CFG
url = "$API/bot$token/$method"
CFG
}

json() {
  node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);const f=new Function("j",process.argv[1]);const r=f(j);if(r===undefined||r===null||r===false){process.exit(1)}console.log(r)})' "$1"
}

stored() {
  aws ssm get-parameter --with-decryption --name "$P/$1" --query Parameter.Value --output text
}

case "${1:-}" in
  token)
    TOKEN="$(pbpaste | tr -d '[:space:]')"
    [[ "$TOKEN" =~ ^[0-9]{6,12}:[A-Za-z0-9_-]{30,}$ ]] || { echo "A área de transferência não tem um token de bot (formato 123456789:AAA...). Copie o token do @BotFather e rode de novo." >&2; exit 1; }
    NAME="$(telegram getMe "$TOKEN" | json 'return j.ok ? "@" + j.result.username : null')" || { echo "O Telegram recusou o token." >&2; exit 1; }
    aws ssm put-parameter --overwrite --type SecureString --name "$P/MONEYLOG_TELEGRAM_BOT_TOKEN" --value "$TOKEN" >/dev/null
    unset TOKEN
    echo "Bot $NAME validado e token gravado no SSM."
    echo "Agora abra o Telegram, mande /start para $NAME e rode: scripts/telegram-setup.sh chat"
    ;;
  chat)
    TOKEN="$(stored MONEYLOG_TELEGRAM_BOT_TOKEN)"
    CHAT="$(telegram getUpdates "$TOKEN" | json 'const m = j.result.map(u => u.message).filter(m => m && m.chat && m.chat.type === "private"); return m.length ? String(m[m.length - 1].chat.id) : null')" || { echo "Nenhuma mensagem encontrada. Mande /start para o seu bot no Telegram e rode de novo." >&2; exit 1; }
    aws ssm put-parameter --overwrite --type SecureString --name "$P/MONEYLOG_TELEGRAM_CHAT_ID" --value "$CHAT" >/dev/null
    telegram sendMessage "$TOKEN" --data-urlencode "chat_id=$CHAT" --data-urlencode "text=moneylog conectado. Os alertas de segurança e as notificações chegam aqui." >/dev/null
    echo "Conversa conectada (id terminado em ${CHAT: -3}). Mandei uma mensagem de teste para o seu Telegram."
    unset TOKEN CHAT
    ;;
  test)
    TOKEN="$(stored MONEYLOG_TELEGRAM_BOT_TOKEN)"
    CHAT="$(stored MONEYLOG_TELEGRAM_CHAT_ID)"
    telegram sendMessage "$TOKEN" --data-urlencode "chat_id=$CHAT" --data-urlencode "text=Teste do moneylog: o Telegram está conectado." >/dev/null
    echo "Mensagem de teste enviada."
    ;;
  *)
    sed -n '2,10p' "$0"; exit 64 ;;
esac
