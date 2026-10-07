/**
 * Nome do produto exibido na interface (wordmark da sidebar, título das páginas, login).
 *
 * "FinVault" do brief DS 02 é só nome de trabalho; o produto se chama **moneylog** (ADR-001, ADR-011).
 * Renomear é editar esta linha (e o `<title>`, o `manifest` e as metas de `index.html`, que são arquivos
 * estáticos e não leem TypeScript: o spec `brand.spec.ts` falha se eles divergirem desta constante).
 * Não há logo: o dono deixou espaços reservados vazios (`.sidebar__logo-slot`, `.login__logo-slot`).
 */
export const BRAND_NAME = 'moneylog';
