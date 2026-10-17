#!/usr/bin/env bash
# Restaura um dump (formato custom) numa base VAZIA (T176). Recusa uma base que já tem tabelas, para nunca sobrescrever dados.
# Para um backup cifrado do job (.dump.enc), descriptografe antes: veja docs/operacao/backup.md.
# Uso:   DB_HOST=... DB_PORT=5432 DB_NAME=... DB_USER=... DB_PASSWORD=... scripts/restore.sh arquivo.dump
set -euo pipefail

FILE="${1:?informe o arquivo .dump}"
: "${DB_NAME:?defina DB_NAME}" "${DB_USER:?defina DB_USER}" "${DB_PASSWORD:?defina DB_PASSWORD}"
HOST="${DB_HOST:-localhost}"
PORT="${DB_PORT:-5432}"
[[ -f "$FILE" ]] || { echo "arquivo não encontrado: $FILE" >&2; exit 1; }
export PGPASSWORD="$DB_PASSWORD"

TABLES=$(psql --host "$HOST" --port "$PORT" --username "$DB_USER" --dbname "$DB_NAME" -At \
  -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")
if [[ "$TABLES" != "0" ]]; then
  echo "a base $DB_NAME não está vazia ($TABLES tabelas). Crie uma base nova para restaurar." >&2
  exit 2
fi

pg_restore --host "$HOST" --port "$PORT" --username "$DB_USER" --dbname "$DB_NAME" \
  --no-owner --no-privileges --exit-on-error "$FILE"
echo "restauração concluída em $DB_NAME"
