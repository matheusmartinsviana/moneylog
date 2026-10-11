#!/bin/bash
# Uso: /opt/moneylog/deploy-frontend.sh <chave-s3 do zip> [sha256]   |   /opt/moneylog/deploy-frontend.sh --rollback
# Baixa o zip do bucket de artefatos, extrai em /srv/app/releases/<id>, troca o symlink /srv/app/current de forma atômica,
# recarrega o Caddy e confere o index.html; se falhar, volta para a versão anterior. Mantém as 3 últimas versões.
set -euo pipefail
# REGION, BUCKET (artefatos) e DOMAIN vêm de /opt/moneylog/edge/front.env (escrito pelo user_data ou, no caminho manual, por você).
# shellcheck source=/dev/null
. /opt/moneylog/edge/front.env
APP=/srv/app
cd "$APP"

reload() { (cd /opt/moneylog && docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --force >/dev/null 2>&1) || true; }
switch_to() { # <id>
  ln -sfn "releases/$1" current.new
  mv -T current.new current
  reload
}
healthy() {
  [ "$(curl -sk --resolve "$DOMAIN:443:127.0.0.1" -o /tmp/front-index.html -w '%{http_code}' "https://$DOMAIN/index.html")" = "200" ] && grep -qi '<app-root' /tmp/front-index.html
}

CURRENT=""; [ -L current ] && CURRENT="$(basename "$(readlink current)")"

if [ "${1:-}" = "--rollback" ]; then
  [ -f .previous ] || { echo "sem versão anterior registrada" >&2; exit 1; }
  PREV="$(cat .previous)"
  [ -d "releases/$PREV" ] || { echo "versão $PREV não está mais em disco" >&2; exit 1; }
  switch_to "$PREV"
  echo "$CURRENT" > .previous
  echo "rollback ok: $PREV"
  exit 0
fi

KEY="${1:?informe a chave S3 do zip (ou --rollback)}"
EXPECTED="${2:-}"
case "$KEY" in frontend/*.zip) ;; *) echo "chave inesperada: $KEY" >&2; exit 1 ;; esac
ID="$(basename "$KEY" .zip)"
case "$ID" in *[!A-Za-z0-9._-]*|"") echo "id inválido: $ID" >&2; exit 1 ;; esac

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
aws s3 cp "s3://$BUCKET/$KEY" "$TMP/front.zip" --region "$REGION" --only-show-errors
if [ -n "$EXPECTED" ]; then
  echo "$EXPECTED  $TMP/front.zip" | sha256sum -c - >/dev/null || { echo "sha256 do zip não confere" >&2; exit 1; }
fi
rm -rf "releases/$ID.partial"
mkdir -p "releases/$ID.partial"
unzip -q "$TMP/front.zip" -d "releases/$ID.partial"
[ -f "releases/$ID.partial/index.html" ] || { rm -rf "releases/$ID.partial"; echo "zip sem index.html" >&2; exit 1; }
rm -rf "releases/$ID"
mv "releases/$ID.partial" "releases/$ID"

switch_to "$ID"
if ! healthy; then
  echo "index.html não respondeu como esperado com $ID" >&2
  if [ -n "$CURRENT" ] && [ "$CURRENT" != "$ID" ]; then
    switch_to "$CURRENT"
    echo "voltando para $CURRENT" >&2
  fi
  exit 1
fi
if [ -n "$CURRENT" ] && [ "$CURRENT" != "$ID" ]; then echo "$CURRENT" > .previous; fi
# Poda: fica com as 3 mais recentes (mais a atual e a anterior).
# shellcheck disable=SC2012
ls -1dt releases/*/ 2>/dev/null | tail -n +4 | while read -r d; do
  d="${d%/}"; n="$(basename "$d")"
  [ "$n" = "$ID" ] || [ "$n" = "$CURRENT" ] || rm -rf "$d"
done
echo "front ok: $ID"
