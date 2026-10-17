#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
PASS=0
FAIL=0
SKIP=0
OUT=""
RC=0
SHIM=""
RUN_ENV=()

ok()   { PASS=$((PASS + 1)); printf '  ok   %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf '  FAIL %s\n       %s\n' "$1" "$2"; }
skip() { SKIP=$((SKIP + 1)); printf '  skip %s\n' "$1"; }
expect()   { if [[ "$2" == "$3" ]]; then ok "$1"; else fail "$1" "esperado [$2], obtido [$3]"; fi; }
contains() { if [[ "$2" == *"$3"* ]]; then ok "$1"; else fail "$1" "não contém [$3] em: $2"; fi; }

SCRIPTS=("$ROOT/moneylog" "$ROOT"/scripts/*.sh "$ROOT"/infra/caddy/*.sh)

section_syntax() {
  echo "== sintaxe e testes com [[ ]]"
  local f found
  for f in "${SCRIPTS[@]}"; do
    if bash -n "$f" 2>"$WORK/err"; then ok "bash -n ${f#"$ROOT"/}"; else fail "bash -n ${f#"$ROOT"/}" "$(cat "$WORK/err")"; fi
  done
  found="$(grep -nE '(^|[ ;(!])\[ ' "${SCRIPTS[@]}" | grep -v '\[\[' || true)"
  expect "nenhum teste com [ simples em moneylog, scripts/*.sh e infra/caddy/*.sh" "" "$found"
}

make_shims() {
  mkdir -p "$WORK/shims"
  local b
  for b in aws curl docker; do
    printf '#!/usr/bin/env bash\necho "%s $*" >> "$SHIM_LOG"\nexit 97\n' "$b" > "$WORK/shims/$b"
  done
  printf '#!/usr/bin/env bash\necho "npm $*" >> "$SHIM_LOG"\nexit 0\n' > "$WORK/shims/npm"
  chmod +x "$WORK/shims"/*
}

run_script() {
  local script="$1"; shift
  : > "$WORK/shim.log"
  OUT="$(env -i HOME="$HOME" PATH="$WORK/shims:/usr/bin:/bin" SHIM_LOG="$WORK/shim.log" ${RUN_ENV[@]+"${RUN_ENV[@]}"} bash "$script" "$@" 2>&1)"
  RC=$?
  SHIM="$(tr '\n' ';' < "$WORK/shim.log")"
}

section_orchestrator() {
  echo "== ./moneylog"
  local m="$ROOT/moneylog"
  RUN_ENV=(); run_script "$m" help
  expect "help: código 0" 0 "$RC"; contains "help: mostra o uso" "$OUT" "./moneylog doctor"
  run_script "$m" git
  expect "git sem args: código 1" 1 "$RC"; contains "git sem args: uso" "$OUT" "uso: ./moneylog git <comando git>"
  run_script "$m" logs xyz
  expect "logs com alvo inválido: código 1" 1 "$RC"; contains "logs com alvo inválido: uso" "$OUT" "uso: ./moneylog logs [db|back|front|all] [-f]"
  run_script "$m" down xyz
  expect "down com alvo inválido: código 1" 1 "$RC"; contains "down com alvo inválido: uso" "$OUT" "uso: ./moneylog down [db|back|front|all]"
  run_script "$m" test nada
  expect "test com alvo inválido: código 1" 1 "$RC"; contains "test com alvo inválido: uso" "$OUT" "uso: ./moneylog test [back|front|all] [--full]"
  expect "alvos inválidos não chamam docker/npm" "" "$SHIM"
}

section_notify() {
  echo "== scripts/notify-deploy.sh"
  local s="$ROOT/scripts/notify-deploy.sh"
  RUN_ENV=(); run_script "$s"
  expect "sem args: código 0" 0 "$RC"
  contains "sem args: mostra o uso" "$OUT" "scripts/notify-deploy.sh <ok|falha> <alvo> <versão> [origem]"
  expect "sem args: não chama aws nem curl" "" "$SHIM"
  RUN_ENV=(MONEYLOG_NOTIFY=0); run_script "$s" ok backend v1
  expect "MONEYLOG_NOTIFY=0: código 0" 0 "$RC"; expect "MONEYLOG_NOTIFY=0: silêncio" "" "$OUT"; expect "MONEYLOG_NOTIFY=0: não chama aws nem curl" "" "$SHIM"
  RUN_ENV=(); run_script "$s" ok backend v1
  expect "sem token: código 0" 0 "$RC"; contains "sem token: aviso pulado" "$OUT" "aviso no Telegram pulado"
  expect "sem token: não chama curl" 0 "$(grep -c '^curl' "$WORK/shim.log")"
  RUN_ENV=(TELEGRAM_BOT_TOKEN=tokenSECRETO TELEGRAM_CHAT_ID=42); run_script "$s" falha frontend abc123 ci
  expect "com token e curl falhando: código 0" 0 "$RC"
  contains "com token e curl falhando: avisa sem derrubar" "$OUT" "não consegui avisar no Telegram"
  contains "com token: mensagem de falha" "$SHIM" "text=❌ moneylog · frontend: deploy falhou"
  expect "com token: token fora do argv do curl" 0 "$(grep -c tokenSECRETO "$WORK/shim.log")"
}

section_deploy_backend() {
  echo "== scripts/deploy-backend.sh"
  local s="$ROOT/scripts/deploy-backend.sh"
  local base=(INSTANCE_ID=i-x AWS_REGION=us-east-1)
  RUN_ENV=(); run_script "$s" --xyz
  expect "argumento desconhecido: código 64" 64 "$RC"; contains "argumento desconhecido: mensagem" "$OUT" "argumento desconhecido: --xyz"
  run_script "$s" --help
  expect "--help: código 0" 0 "$RC"; contains "--help: uso" "$OUT" "scripts/deploy-backend.sh [--dry-run]"
  run_script "$s" --tag
  expect "--tag sem valor: código 1" 1 "$RC"; contains "--tag sem valor: mensagem" "$OUT" "--tag exige um valor"
  RUN_ENV=(AWS_REGION=us-east-1); run_script "$s" --dry-run --skip-build
  expect "sem INSTANCE_ID: código 1" 1 "$RC"; contains "sem INSTANCE_ID: mensagem" "$OUT" "defina INSTANCE_ID"
  RUN_ENV=("${base[@]}"); run_script "$s" --dry-run --skip-build
  expect "sem ECR_REPOSITORY: código 1" 1 "$RC"; contains "sem ECR_REPOSITORY: mensagem" "$OUT" "defina ECR_REPOSITORY"
  RUN_ENV=("${base[@]}" ECR_REPOSITORY=1.dkr.ecr.us-east-1.amazonaws.com/moneylog-backend TAG=abc123)
  run_script "$s" --dry-run --skip-build
  expect "dry-run skip-build: código 0" 0 "$RC"
  contains "dry-run skip-build: roteiro" "$OUT" "==> enviando para i-x: /opt/moneylog/deploy.sh abc123"
  contains "dry-run skip-build: ssm só impresso" "$OUT" "(dryrun) aws ssm send-command --instance-ids i-x --document-name AWS-RunShellScript"
  expect "dry-run skip-build: nenhuma chamada a aws/docker" "" "$SHIM"
  run_script "$s" --dry-run
  expect "dry-run com build: código 0" 0 "$RC"
  contains "dry-run com build: docker só impresso" "$OUT" "(dryrun) docker buildx build --platform linux/amd64 -t 1.dkr.ecr.us-east-1.amazonaws.com/moneylog-backend:abc123 --push"
  expect "dry-run com build: nenhuma chamada a aws/docker" "" "$SHIM"
  RUN_ENV=("${base[@]}"); run_script "$s" --dry-run --rollback
  expect "dry-run rollback: código 0" 0 "$RC"
  contains "dry-run rollback: roteiro" "$OUT" "==> enviando para i-x: /opt/moneylog/deploy.sh --rollback"
  expect "dry-run rollback: nenhuma chamada a aws/docker" "" "$SHIM"
}

section_deploy_frontend() {
  echo "== scripts/deploy-frontend.sh"
  local repo="$WORK/repo"
  mkdir -p "$repo/scripts" "$repo/frontend/dist/moneylog/browser"
  cp "$ROOT/scripts/deploy-frontend.sh" "$ROOT/scripts/notify-deploy.sh" "$repo/scripts/"
  local s="$repo/scripts/deploy-frontend.sh" dist="$repo/frontend/dist/moneylog/browser"
  local cf=(EDGE_MODE=cloudflare INSTANCE_ID=i-x AWS_REGION=us-east-1 ARTIFACTS_BUCKET=b)
  RUN_ENV=(); run_script "$s" --xyz
  expect "argumento desconhecido: código 64" 64 "$RC"; contains "argumento desconhecido: mensagem" "$OUT" "argumento desconhecido: --xyz"
  run_script "$s" --help
  expect "--help: código 0" 0 "$RC"; contains "--help: uso" "$OUT" "scripts/deploy-frontend.sh --print-csp"
  RUN_ENV=("${cf[@]}"); run_script "$s" --dry-run --skip-build
  expect "cloudflare sem build em disco: código 1" 1 "$RC"; contains "cloudflare sem build em disco: mensagem" "$OUT" "build não encontrado em"
  printf '<html><head><script>1</script></head><body><app-root></app-root></body></html>' > "$dist/index.html"
  printf '{}' > "$dist/ngsw.json"
  printf 'x' > "$dist/main.abc.js"
  run_script "$s" --dry-run --skip-build
  expect "cloudflare dry-run skip-build: código 0" 0 "$RC"
  contains "cloudflare dry-run skip-build: zip só impresso" "$OUT" "(dryrun) aws s3 cp "
  contains "cloudflare dry-run skip-build: ssm só impresso" "$OUT" "(dryrun) aws ssm send-command --instance-ids i-x: /opt/moneylog/deploy-frontend.sh frontend/nogit-"
  expect "cloudflare dry-run skip-build: nenhuma chamada a aws/npm" "" "$SHIM"
  run_script "$s" --dry-run
  expect "cloudflare dry-run com build: código 0" 0 "$RC"
  expect "cloudflare dry-run com build: npm ci --ignore-scripts e npm run build" "npm ci --ignore-scripts;npm run build;" "$SHIM"
  run_script "$s" --dry-run --rollback
  expect "cloudflare dry-run rollback: código 0" 0 "$RC"
  contains "cloudflare dry-run rollback: roteiro" "$OUT" "(dryrun) aws ssm send-command --instance-ids i-x: /opt/moneylog/deploy-frontend.sh --rollback"
  expect "cloudflare dry-run rollback: nenhuma chamada a aws" "" "$SHIM"
  RUN_ENV=(EDGE_MODE=cloudflare AWS_REGION=us-east-1 ARTIFACTS_BUCKET=b); run_script "$s" --dry-run --skip-build
  expect "cloudflare sem INSTANCE_ID: código 1" 1 "$RC"; contains "cloudflare sem INSTANCE_ID: mensagem" "$OUT" "defina INSTANCE_ID"
  RUN_ENV=(EDGE_MODE=cloudflare INSTANCE_ID=i-x AWS_REGION=us-east-1); run_script "$s" --dry-run --skip-build
  contains "cloudflare sem ARTIFACTS_BUCKET: mensagem" "$OUT" "defina ARTIFACTS_BUCKET"
  if [[ "${BASH_VERSINFO[0]}" -ge 4 ]]; then expect "cloudflare sem ARTIFACTS_BUCKET: código 1" 1 "$RC"; else skip "cloudflare sem ARTIFACTS_BUCKET: código (bash 3.2 devolve 0 por causa do trap, igual à main)"; fi
  RUN_ENV=(S3_BUCKET=site CLOUDFRONT_DISTRIBUTION_ID=E1); run_script "$s" --dry-run --rollback
  expect "cloudfront rollback: código 64" 64 "$RC"; contains "cloudfront rollback: mensagem" "$OUT" "--rollback só existe no modo cloudflare"
  RUN_ENV=(CLOUDFRONT_DISTRIBUTION_ID=E1); run_script "$s" --dry-run --skip-build
  expect "cloudfront sem S3_BUCKET: código 1" 1 "$RC"; contains "cloudfront sem S3_BUCKET: mensagem" "$OUT" "defina S3_BUCKET"
  RUN_ENV=(S3_BUCKET=site); run_script "$s" --dry-run --skip-build
  expect "cloudfront sem CLOUDFRONT_DISTRIBUTION_ID: código 1" 1 "$RC"; contains "cloudfront sem CLOUDFRONT_DISTRIBUTION_ID: mensagem" "$OUT" "defina CLOUDFRONT_DISTRIBUTION_ID"
  RUN_ENV=(S3_BUCKET=site CLOUDFRONT_DISTRIBUTION_ID=E1); run_script "$s" --dry-run --skip-build
  contains "cloudfront dry-run: sync com --dryrun" "$SHIM" "aws s3 sync $dist s3://site --dryrun --delete"
  expect "cloudfront dry-run: para na primeira chamada quando o aws falha" 1 "$(grep -c '^aws' "$WORK/shim.log")"
  expect "cloudfront dry-run: falha do aws propaga o código do comando" 97 "$RC"
  RUN_ENV=(); run_script "$s" --print-csp --skip-build
  expect "--print-csp: código 0" 0 "$RC"; contains "--print-csp: CSP com hash do script inline" "$OUT" "script-src 'self' 'sha256-"
}

section_remote() {
  echo "== infra/caddy/deploy-frontend.remote.sh (simulação em Linux via docker)"
  if ! docker info >/dev/null 2>&1; then skip "docker indisponível"; return; fi
  local sim="$WORK/remote"
  mkdir -p "$sim/shims" "$sim/bucket/frontend" "$sim/zip/good" "$sim/zip/noindex"
  cp "$ROOT/infra/caddy/deploy-frontend.remote.sh" "$sim/script.sh"
  printf '<html><app-root></app-root></html>' > "$sim/zip/good/index.html"
  printf 'y' > "$sim/zip/noindex/other.txt"
  tar -cf "$sim/bucket/frontend/good.zip" -C "$sim/zip/good" .
  tar -cf "$sim/bucket/frontend/noindex.zip" -C "$sim/zip/noindex" .
  cp "$sim/bucket/frontend/good.zip" "$sim/bucket/frontend/r7.zip"
  cat > "$sim/shims/aws" <<'SH'
#!/bin/bash
echo "aws $*" >> /sim/shim.log
if [[ "$1" == s3 && "$2" == cp ]]; then src="${3#s3://b/}"; [[ -f "/sim/bucket/$src" ]] || { echo "fatal error: NoSuchKey $3" >&2; exit 1; }; cp "/sim/bucket/$src" "$4"; exit 0; fi
exit 1
SH
  cat > "$sim/shims/curl" <<'SH'
#!/bin/bash
out=""; while [[ $# -gt 0 ]]; do [[ "$1" == -o ]] && out="$2"; shift; done
[[ -n "$out" ]] && cp /sim/health.body "$out"
cat /sim/health.code
SH
  printf '#!/bin/bash\necho "docker $*" >> /sim/shim.log\nexit 0\n' > "$sim/shims/docker"
  cat > "$sim/shims/unzip" <<'SH'
#!/bin/bash
f=""; d=""; while [[ $# -gt 0 ]]; do case "$1" in -q) ;; -d) d="$2"; shift ;; *) f="$1" ;; esac; shift; done
tar -xf "$f" -C "$d"
SH
  chmod +x "$sim/shims"/*
  cat > "$sim/run.sh" <<'SH'
#!/bin/bash
set -u
mkdir -p /opt/moneylog/edge
printf 'REGION=us-east-1\nBUCKET=b\nDOMAIN=app.test\n' > /opt/moneylog/edge/front.env
export PATH=/sim/shims:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
GOODSHA="$(sha256sum /sim/bucket/frontend/good.zip | cut -d' ' -f1)"
fresh() { rm -rf /srv/app; mkdir -p /srv/app/releases; cd /srv/app || exit 1; : > /sim/shim.log; printf '<html><app-root></app-root></html>' > /sim/health.body; echo 200 > /sim/health.code; }
rel() { mkdir -p "/srv/app/releases/$1"; echo "$1" > "/srv/app/releases/$1/index.html"; touch -d "2026-01-0$2 00:00" "/srv/app/releases/$1"; }
cur() { ln -sfn "releases/$1" /srv/app/current; }
run() { OUT="$(bash /sim/script.sh "$@" 2>&1)"; RC=$?; CUR="$(readlink /srv/app/current 2>/dev/null || echo -)"; PREV="$(cat /srv/app/.previous 2>/dev/null || echo -)"; RELS="$(ls /srv/app/releases | sort | tr '\n' ' ')"; }
check() { if [[ "$2" == "$3" ]]; then echo "PASS $1"; else echo "FAIL $1 | esperado [$2], obtido [$3]"; fi; }
has() { if [[ "$2" == *"$3"* ]]; then echo "PASS $1"; else echo "FAIL $1 | não contém [$3] em: $2"; fi; }

fresh; run --rollback
check "rollback sem .previous: código 1" 1 "$RC"; has "rollback sem .previous: mensagem" "$OUT" "sem versão anterior registrada"
fresh; rel a 1; rel b 2; cur b; echo a > .previous; run --rollback
check "rollback ok: código 0" 0 "$RC"; has "rollback ok: mensagem" "$OUT" "rollback ok: a"; check "rollback ok: current" releases/a "$CUR"; check "rollback ok: .previous vira a versão deixada" b "$PREV"
fresh; rel b 2; cur b; echo a > .previous; run --rollback
check "rollback com versão sumida: código 1" 1 "$RC"; has "rollback com versão sumida: mensagem" "$OUT" "versão a não está mais em disco"; check "rollback com versão sumida: current intacto" releases/b "$CUR"
fresh; run other/x.zip
check "chave fora de frontend/*.zip: código 1" 1 "$RC"; has "chave fora de frontend/*.zip: mensagem" "$OUT" "chave inesperada: other/x.zip"; check "chave fora do padrão: nada baixado" "" "$(cat /sim/shim.log)"
fresh; run "frontend/a b.zip"
check "id com espaço: código 1" 1 "$RC"; has "id com espaço: mensagem" "$OUT" "id inválido: a b"
fresh; run frontend/good.zip 0000000000000000000000000000000000000000000000000000000000000000
check "sha errado: código 1" 1 "$RC"; has "sha errado: mensagem" "$OUT" "sha256 do zip não confere"; check "sha errado: nenhuma release criada" "" "$RELS"
fresh; run frontend/noindex.zip
check "zip sem index.html: código 1" 1 "$RC"; has "zip sem index.html: mensagem" "$OUT" "zip sem index.html"; check "zip sem index.html: pasta parcial removida" "" "$RELS"; check "zip sem index.html: current não criado" - "$CUR"
fresh; run frontend/good.zip
check "sucesso sem versão atual: código 0" 0 "$RC"; has "sucesso sem versão atual: mensagem" "$OUT" "front ok: good"; check "sucesso sem versão atual: current" releases/good "$CUR"; check "sucesso sem versão atual: sem .previous" - "$PREV"
fresh; rel a 1; cur a; run frontend/good.zip "$GOODSHA"
check "sucesso com sha e versão atual: código 0" 0 "$RC"; check "sucesso com versão atual: current" releases/good "$CUR"; check "sucesso com versão atual: .previous" a "$PREV"
fresh; rel a 1; cur a; echo 500 > /sim/health.code; run frontend/good.zip
check "saúde falha com versão atual: código 1" 1 "$RC"; has "saúde falha: mensagem" "$OUT" "index.html não respondeu como esperado com good"; has "saúde falha: volta" "$OUT" "voltando para a"; check "saúde falha: current volta" releases/a "$CUR"; check "saúde falha: .previous não gravado" - "$PREV"
fresh; echo 500 > /sim/health.code; run frontend/good.zip
check "saúde falha sem versão atual: código 1" 1 "$RC"; check "saúde falha sem versão atual: current fica na nova" releases/good "$CUR"
fresh; rel a 1; cur a; printf 'nope' > /sim/health.body; run frontend/good.zip
check "200 sem app-root: código 1" 1 "$RC"; check "200 sem app-root: current volta" releases/a "$CUR"
fresh; rel r1 1; rel r2 2; rel r3 3; rel r4 4; rel r5 5; rel r6 6; cur r6; run frontend/r7.zip
check "poda com 6 releases: código 0" 0 "$RC"; check "poda com 6 releases: ficam as 3 mais recentes" "r5 r6 r7 " "$RELS"; check "poda: .previous" r6 "$PREV"
fresh; rel good 1; cur good; run frontend/good.zip
check "redeploy do mesmo id: código 0" 0 "$RC"; check "redeploy do mesmo id: .previous não gravado" - "$PREV"
fresh; run
check "sem args: código 1" 1 "$RC"; has "sem args: mensagem" "$OUT" "informe a chave S3 do zip (ou --rollback)"
fresh; run frontend/nada.zip
check "chave inexistente no bucket: código 1" 1 "$RC"; check "chave inexistente: nenhuma release" "" "$RELS"
SH
  local line
  while IFS= read -r line; do
    case "$line" in
      PASS\ *) ok "${line#PASS }" ;;
      FAIL\ *) fail "${line#FAIL }" "" ;;
      *) printf '       %s\n' "$line" ;;
    esac
  done < <(docker run --rm -v "$sim":/sim postgres:17 bash /sim/run.sh 2>&1)
}

section_shellcheck() {
  echo "== shellcheck -S warning (docker)"
  if ! docker info >/dev/null 2>&1; then skip "docker indisponível"; return; fi
  local args=() f out
  for f in "${SCRIPTS[@]}"; do args+=("/w/${f#"$ROOT"/}"); done
  out="$(docker run --rm -v "$ROOT":/w koalaman/shellcheck:stable -S warning "${args[@]}" 2>&1)"
  expect "shellcheck sem avisos" "" "$out"
}

section_terraform() {
  echo "== terraform fmt/validate (docker)"
  if ! docker info >/dev/null 2>&1; then skip "docker indisponível"; return; fi
  local out
  out="$(docker run --rm -v "$ROOT/infra/terraform":/w -w /w hashicorp/terraform:1.9.8 fmt -check -recursive 2>&1)"
  expect "terraform fmt -check" "" "$out"
  cp -R "$ROOT/infra/terraform" "$WORK/tf"
  if docker run --rm -v "$WORK/tf":/w -w /w hashicorp/terraform:1.9.8 init -backend=false -input=false -no-color >"$WORK/tf-init.log" 2>&1; then ok "terraform init -backend=false"; else fail "terraform init -backend=false" "$(tail -5 "$WORK/tf-init.log")"; fi
  out="$(docker run --rm -v "$WORK/tf":/w -w /w hashicorp/terraform:1.9.8 validate -no-color 2>&1)"
  contains "terraform validate" "$out" "Success! The configuration is valid."
  expect "policy HTTPS-only no bucket artifacts" 1 "$(grep -c 'resource "aws_s3_bucket_policy" "artifacts"' "$ROOT/infra/terraform/edge_cloudflare.tf")"
  expect "policy HTTPS-only no bucket backups" 1 "$(grep -c 'resource "aws_s3_bucket_policy" "backups"' "$ROOT/infra/terraform/storage_cdn.tf")"
  expect "condição aws:SecureTransport nos dois buckets" 2 "$(grep -c 'variable = "aws:SecureTransport"' "$ROOT"/infra/terraform/edge_cloudflare.tf "$ROOT"/infra/terraform/storage_cdn.tf | awk -F: '{s+=$2} END {print s}')"
}

make_shims
section_syntax
section_orchestrator
section_notify
section_deploy_backend
section_deploy_frontend
section_remote
section_shellcheck
if [[ "${SKIP_TERRAFORM:-0}" == 1 ]]; then echo "== terraform fmt/validate"; skip "SKIP_TERRAFORM=1"; else section_terraform; fi

echo
printf 'passaram: %d · falharam: %d · pulados: %d\n' "$PASS" "$FAIL" "$SKIP"
[[ "$FAIL" -eq 0 ]]
