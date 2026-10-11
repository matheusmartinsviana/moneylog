#!/bin/bash
# Confere, sem imprimir o segredo, se o JWT_SECRET de produção (SSM) passa na validação de entropia do backend.
# Rode ANTES de publicar um backend com a validação estrita: se reprovar, o backend não sobe.
# Uso: AWS_REGION=us-east-1 scripts/check-jwt-secret-prod.sh
set -euo pipefail
export AWS_REGION="${AWS_REGION:-us-east-1}"
SECRET="$(aws ssm get-parameter --with-decryption --name /moneylog/prod/JWT_SECRET --query Parameter.Value --output text)"
JWT_SECRET_TO_CHECK="$SECRET" node -e '
const s = process.env.JWT_SECRET_TO_CHECK ?? "";
const points = [...s].map((c) => c.codePointAt(0));
const counts = new Map();
for (const p of points) counts.set(p, (counts.get(p) ?? 0) + 1);
const repeatsAUnit = () => {
  for (let unit = 1; unit <= points.length / 2; unit++) {
    if (points.length % unit !== 0) continue;
    let ok = true;
    for (let i = unit; i < points.length && ok; i++) ok = points[i] === points[i - unit];
    if (ok) return true;
  }
  return false;
};
let up = 1, down = 1, best = 1;
for (let i = 1; i < points.length; i++) {
  up = points[i] === points[i - 1] + 1 ? up + 1 : 1;
  down = points[i] === points[i - 1] - 1 ? down + 1 : 1;
  best = Math.max(best, up, down);
}
const bytes = Buffer.byteLength(s, "utf8");
let problem = null;
if (bytes < 32) problem = "menos de 32 bytes";
else if (counts.size < 12) problem = "poucos caracteres distintos";
else if (Math.max(...counts.values()) > points.length * 0.25) problem = "um caractere domina o segredo";
else if (repeatsAUnit()) problem = "padrão repetido";
else if (best > 6) problem = "sequência trivial";
console.log(problem ? "REPROVADO: " + problem + " (gere outro: openssl rand -base64 48)" : "OK: o JWT_SECRET de produção passa na validação (" + bytes + " bytes, " + counts.size + " caracteres distintos)");
process.exit(problem ? 1 : 0);
'
unset SECRET
