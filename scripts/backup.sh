#!/usr/bin/env bash
# Backup manual do Postgres do moneylog (T176): pg_dump em formato custom para um arquivo com carimbo UTC.
# O backup AUTOMÁTICO (cifra, S3, retenção) é o job do backend (MONEYLOG_BACKUP_ENABLED=true); este script é o caminho manual/de emergência.
# Uso:   DB_HOST=... DB_PORT=5432 DB_NAME=... DB_USER=... DB_PASSWORD=... scripts/backup.sh [diretório-de-saída]
# A senha vai por PGPASSWORD (nunca na linha de comando).
set -euo pipefail

: "${DB_NAME:?defina DB_NAME}" "${DB_USER:?defina DB_USER}" "${DB_PASSWORD:?defina DB_PASSWORD}"
HOST="${DB_HOST:-localhost}"
PORT="${DB_PORT:-5432}"
OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"

FILE="$OUT_DIR/moneylog-$(date -u +%Y%m%dT%H%M%SZ).dump"
PGPASSWORD="$DB_PASSWORD" pg_dump --host "$HOST" --port "$PORT" --username "$DB_USER" \
  --format=custom --no-owner --no-privileges --file "$FILE" "$DB_NAME"
chmod 600 "$FILE"
echo "backup gravado em $FILE"
