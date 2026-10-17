#!/usr/bin/env bash
# ZERA o banco de UM ambiente (apaga TODOS os dados) e deixa só o schema novo + o dono único SEM senha, para o primeiro acesso.
# PERIGOSO. Nunca roda por padrão e não está ligado a nenhum workflow. Roda NA INSTÂNCIA (modo database_mode = "ec2"),
# como root, num terminal interativo (aws ssm start-session --target <id>; sudo -i):
#
#   RESET_ENV_NAME=prod /opt/moneylog/reset-database.sh
#
# Proteções:
#   1. exige terminal interativo e RESET_ENV_NAME; você digita o nome do ambiente de novo para confirmar (sem --yes, sem modo silencioso);
#   2. pré-checagens ANTES de apagar: precisa existir MONEYLOG_OWNER_SETUP_CODE e NÃO pode haver MONEYLOG_OWNER_PASSWORD_HASH;
#   3. pg_dump de segurança (formato custom) antes; se falhar ou vier vazio, nada é apagado;
#   4. depois: recria o schema public vazio e religa o backend, que roda o Flyway (schema completo) e cria o dono (MONEYLOG_OWNER_EMAIL)
#      sem senha. O dono define a senha em POST /v1/auth/setup-password com o código de primeiro acesso (ADR-015).
# O dump de segurança fica em $COMPOSE_DIR/safety-backups/ (restaurar: scripts/restore.sh, numa base vazia).
set -euo pipefail

COMPOSE_DIR="${COMPOSE_DIR:-/opt/moneylog}"
SECRETS="$COMPOSE_DIR/secrets"
SAFETY_DIR="$COMPOSE_DIR/safety-backups"

die() { echo "ERRO: $*" >&2; exit 1; }

[[ "$(id -u)" -eq 0 ]] || die "rode como root (sudo -i) para ler os segredos."
[[ -n "${RESET_ENV_NAME:-}" ]] || die "defina RESET_ENV_NAME com o nome do ambiente que será ZERADO (ex.: prod)."
[[ -t 0 && -t 1 ]] || die "precisa de terminal interativo (aws ssm start-session). Não há modo automático."
[[ -f "$COMPOSE_DIR/docker-compose.yml" ]] || die "compose não encontrado em $COMPOSE_DIR (defina COMPOSE_DIR)."
cd "$COMPOSE_DIR"
[[ -n "$(docker compose ps -q postgres 2>/dev/null)" ]] || die "serviço postgres do compose não está rodando aqui (modo rds? zere o RDS manualmente)."

read_secret() { [[ -f "$SECRETS/$1" ]] && tr -d '\n' < "$SECRETS/$1" || true; }
DB_USER="$(read_secret DB_USER)"
DB_NAME="${DB_NAME:-moneylog}"
[[ -n "$DB_USER" ]] || die "DB_USER ausente em $SECRETS (rode deploy.sh antes)."

# Pré-checagens: sem isto o dono voltaria com senha antiga ou o app ficaria sem como fazer o primeiro acesso.
[[ -z "$(read_secret MONEYLOG_OWNER_PASSWORD_HASH)" ]] \
  || die "MONEYLOG_OWNER_PASSWORD_HASH está definido no SSM: o dono nasceria COM senha. Apague o parâmetro e rode deploy.sh para atualizar os segredos."
[[ -n "$(read_secret MONEYLOG_OWNER_SETUP_CODE)" ]] \
  || die "MONEYLOG_OWNER_SETUP_CODE ausente no SSM: sem o código ninguém consegue o primeiro acesso. Crie o parâmetro (SecureString) e rode deploy.sh."
[[ -n "$(read_secret MONEYLOG_OWNER_EMAIL)" ]] || die "MONEYLOG_OWNER_EMAIL ausente no SSM."

psql_exec() { docker compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 "$@"; }

TABLES="$(psql_exec -At -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")"
echo "Ambiente: $RESET_ENV_NAME | banco: $DB_NAME | tabelas no schema public: $TABLES"
echo "Isto APAGA TODOS OS DADOS (contas, lançamentos, metas, notas, fotos, usuários). Um dump de segurança será feito antes."
printf 'Para confirmar, digite o nome do ambiente (%s): ' "$RESET_ENV_NAME"
read -r ANSWER < /dev/tty
[[ "$ANSWER" == "$RESET_ENV_NAME" ]] || die "confirmação diferente de '$RESET_ENV_NAME'. Nada foi alterado."

umask 077
mkdir -p "$SAFETY_DIR"
DUMP="$SAFETY_DIR/moneylog-before-reset-$(date -u +%Y%m%dT%H%M%SZ).dump"
echo "==> dump de segurança em $DUMP"
if ! docker compose exec -T postgres pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom --no-owner --no-privileges > "$DUMP" || [[ ! -s "$DUMP" ]]; then
  rm -f "$DUMP"
  die "o dump de segurança falhou ou veio vazio. Nada foi apagado."
fi
echo "    $(du -h "$DUMP" | cut -f1) gravados"

echo "==> parando o backend"
docker compose stop backend
echo "==> recriando o schema public vazio"
psql_exec -c "DROP SCHEMA public CASCADE" -c "CREATE SCHEMA public AUTHORIZATION \"$DB_USER\""
echo "==> religando o backend (Flyway recria o schema; o dono nasce sem senha)"
docker compose start backend

for _ in $(seq 1 36); do
  if curl -fsS http://127.0.0.1:8080/actuator/health 2>/dev/null | grep -q '"UP"'; then
    echo "pronto: banco zerado. Faça o primeiro acesso com o e-mail do dono e o MONEYLOG_OWNER_SETUP_CODE (POST /v1/auth/setup-password)."
    echo "Depois do primeiro acesso, troque/apague o código de primeiro acesso no SSM por segurança."
    echo "Dump de segurança: $DUMP (apague quando não precisar mais)."
    exit 0
  fi
  sleep 5
done
die "o backend não ficou UP em 3 minutos: veja 'docker compose logs backend'. O dump de segurança está em $DUMP."
