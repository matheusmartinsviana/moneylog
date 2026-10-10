#!/usr/bin/env bash
# Publica o front (Angular) no S3 e invalida o CloudFront. Idempotente: pode rodar quantas vezes quiser.
# Sem segredos: o destino vem de variáveis de ambiente; as credenciais AWS vêm do perfil/SSO/OIDC da sua sessão (aws configure sso).
#
#   S3_BUCKET=... CLOUDFRONT_DISTRIBUTION_ID=... scripts/deploy-frontend.sh [--dry-run] [--skip-build]
#   scripts/deploy-frontend.sh --print-csp     # imprime uma Content-Security-Policy com os hashes dos scripts inline do build
#
# Valores vêm de `terraform output` (frontend_bucket e cloudfront_distribution_id).
# --dry-run: faz o build (a menos que --skip-build), mostra o que mudaria no S3 (aws s3 sync --dryrun) e NÃO envia nem invalida.
#
# Cache (o CloudFront respeita o Cache-Control do objeto):
#   - JS, CSS e fontes com hash no nome: 1 ano, immutable.
#   - index.html, ngsw.json, ngsw-worker.js, sw-push.js, manifest.webmanifest: no-cache (sempre revalidam; é por eles que o PWA atualiza).
#   - o resto (ícones e imagens sem hash): 1 dia.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/frontend/dist/moneylog/browser"
DRY_RUN=false
SKIP_BUILD=false
PRINT_CSP=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --skip-build) SKIP_BUILD=true ;;
    --print-csp) PRINT_CSP=true ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "argumento desconhecido: $arg" >&2; exit 64 ;;
  esac
done

build() {
  if [ "$SKIP_BUILD" = true ]; then
    echo "==> build pulado (--skip-build); usando $DIST"
  else
    echo "==> build de produção"
    (cd "$ROOT/frontend" && npm ci && npm run build)
  fi
  [ -f "$DIST/index.html" ] || { echo "build não encontrado em $DIST" >&2; exit 1; }
}

print_csp() {
  python3 -I - "$DIST/index.html" <<'PY'
import base64, hashlib, re, sys
html = open(sys.argv[1], encoding="utf-8").read()
hashes = []
for body in re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", html, re.S):
    digest = base64.b64encode(hashlib.sha256(body.encode("utf-8")).digest()).decode()
    hashes.append("'sha256-%s'" % digest)
script_src = " ".join(["'self'"] + hashes)
print("default-src 'self'; script-src %s; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
      "font-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; "
      "base-uri 'self'; form-action 'self'; frame-ancestors 'none'" % script_src)
PY
}

if [ "$PRINT_CSP" = true ]; then
  build
  print_csp
  exit 0
fi

: "${S3_BUCKET:?defina S3_BUCKET (terraform output frontend_bucket)}"
: "${CLOUDFRONT_DISTRIBUTION_ID:?defina CLOUDFRONT_DISTRIBUTION_ID (terraform output cloudfront_distribution_id)}"

command -v aws >/dev/null || { echo "aws CLI não encontrada" >&2; exit 1; }
build

SYNC_FLAGS=()
[ "$DRY_RUN" = true ] && SYNC_FLAGS+=(--dryrun)
DEST="s3://$S3_BUCKET"
NO_CACHE_FILES=(index.html ngsw.json ngsw-worker.js sw-push.js manifest.webmanifest)

echo "==> 1/3 arquivos com hash (immutable)"
aws s3 sync "$DIST" "$DEST" "${SYNC_FLAGS[@]}" --delete \
  --exclude "*" --include "*.js" --include "*.css" --include "media/*" \
  --exclude "ngsw-worker.js" --exclude "sw-push.js" \
  --cache-control "public,max-age=31536000,immutable"

echo "==> 2/3 ícones e demais arquivos sem hash (1 dia)"
EXCLUDES=(--exclude "*.js" --exclude "*.css" --exclude "media/*")
for f in "${NO_CACHE_FILES[@]}"; do EXCLUDES+=(--exclude "$f"); done
aws s3 sync "$DIST" "$DEST" "${SYNC_FLAGS[@]}" --delete "${EXCLUDES[@]}" \
  --cache-control "public,max-age=86400"

# Por último: o index.html e o service worker só passam a apontar para arquivos que já estão no bucket.
echo "==> 3/3 index.html, service worker e manifest (no-cache)"
for f in "${NO_CACHE_FILES[@]}"; do
  [ -f "$DIST/$f" ] || continue
  case "$f" in
    *.html) TYPE="text/html; charset=utf-8" ;;
    *.json) TYPE="application/json" ;;
    *.js) TYPE="text/javascript; charset=utf-8" ;;
    *.webmanifest) TYPE="application/manifest+json" ;;
  esac
  if [ "$DRY_RUN" = true ]; then
    echo "(dryrun) upload: $f -> $DEST/$f  [no-cache, $TYPE]"
  else
    aws s3 cp "$DIST/$f" "$DEST/$f" --cache-control "no-cache" --content-type "$TYPE" --only-show-errors
  fi
done

if [ "$DRY_RUN" = true ]; then
  echo "(dryrun) invalidação de /* na distribuição $CLOUDFRONT_DISTRIBUTION_ID não enviada"
  exit 0
fi

echo "==> invalidando o cache do CloudFront"
aws cloudfront create-invalidation --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" --paths "/*" \
  --query 'Invalidation.[Id,Status]' --output text
echo "pronto. A primeira invalidação mensal de até 1.000 caminhos é gratuita; /* conta como 1 caminho."
