import type { SpendingByCategory } from '~/modules/reports/core/types/reports';
import { lastDayOfMonth, toMoney } from '~/modules/reports/mock-data/demo-support';

/** Categorias de demonstração do mês, em centavos, já em ordem decrescente. */
const CATEGORIES: readonly { id: string; name: string; cents: number }[] = [
  { id: 'demo-housing', name: 'Moradia', cents: 182_000 },
  { id: 'demo-food', name: 'Alimentação', cents: 82_000 },
  { id: 'demo-shopping', name: 'Compras', cents: 61_000 },
  { id: 'demo-transport', name: 'Transporte', cents: 42_000 },
  { id: 'demo-subscriptions', name: 'Assinaturas', cents: 24_000 },
  { id: 'demo-leisure', name: 'Lazer', cents: 9_000 },
  { id: 'demo-health', name: 'Saúde', cents: 8_550 },
];

/** Razão com 4 casas, `HALF_UP` (a regra do backend; aqui só simulada). */
function share(cents: number, base: number): string | null {
  if (base <= 0) return null;
  const rounded = Math.floor((cents * 20_000 + base) / (2 * base));
  return `${Math.trunc(rounded / 10_000)}.${String(rounded % 10_000).padStart(4, '0')}`;
}

/**
 * Gastos por categoria de DEMONSTRAÇÃO no formato do contrato futuro (plano 5.2): as `limit` maiores
 * categorias, `other` com as demais, `share` = valor / `base` (4 casas). `base` = soma das positivas.
 */
export function demoSpendingByCategory(month: string, limit = 5): SpendingByCategory {
  const [year, mm] = month.split('-').map(Number);
  const base = CATEGORIES.reduce((sum, c) => sum + c.cents, 0);
  const size = Math.min(Math.max(Math.trunc(limit), 1), 10);
  const items = CATEGORIES.slice(0, size);
  const rest = CATEGORIES.slice(size);
  const restCents = rest.reduce((sum, c) => sum + c.cents, 0);
  return {
    basis: 'COMPETENCE',
    from: `${month}-01`,
    to: lastDayOfMonth(year!, mm!),
    total: toMoney(base),
    base: toMoney(base),
    items: items.map((c) => ({
      category: { id: c.id, name: c.name },
      amount: toMoney(c.cents),
      share: share(c.cents, base),
    })),
    other:
      rest.length > 0
        ? { amount: toMoney(restCents), share: share(restCents, base), categories: rest.length }
        : null,
  };
}
