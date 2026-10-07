import { addMonthsKey } from '~/demo/demo-dates';
import { money, type S, type World } from '~/demo/demo-world';

/**
 * IA no modo demonstração: **desligada** por padrão (nada é enviado a terceiros), sem histórico, e os insights
 * determinísticos calculados com os dados de exemplo, no formato do contrato. Aqui há aritmética porque este
 * arquivo simula o backend; no app real o front não calcula nada. Só entra no build `demo`.
 */
const MIN_DELTA_PERCENT = 10;
const MIN_DELTA_CENTS = 5000;

export function aiStatus(): S['AiStatus'] {
  return {
    enabled: false,
    provider: 'none',
    model: '',
    dailyCallsRemaining: 0,
    monthlyTokensRemaining: 0,
    circuit: 'CLOSED',
  };
}

const plain = (cents: number) => money(cents).amount;

function byCategory(w: World, month: string): Map<string, number> {
  const totals = new Map<string, number>();
  for (const e of w.consumption.filter((x) => x.competence === month))
    totals.set(e.categoryId, (totals.get(e.categoryId) ?? 0) + e.cents);
  return totals;
}

export function insightsView(w: World, month: string): S['InsightSlice'] {
  const now = byCategory(w, month);
  const before = byCategory(w, addMonthsKey(month, -1));
  const items: S['Insight'][] = [];

  const deltas = [...now.entries()]
    .map(([id, current]) => ({ id, current, previous: before.get(id) ?? 0 }))
    .filter((d) => d.previous > 0)
    .map((d) => ({ ...d, delta: d.current - d.previous }))
    .filter(
      (d) =>
        Math.abs((d.delta * 100) / d.previous) >= MIN_DELTA_PERCENT &&
        Math.abs(d.delta) >= MIN_DELTA_CENTS,
    )
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3);

  for (const d of deltas) {
    const name = w.categories.find((c) => c.id === d.id)?.name ?? '';
    items.push({
      type: 'CATEGORY_DELTA',
      key: d.delta > 0 ? 'insight.category.up' : 'insight.category.down',
      params: {
        categoryId: d.id,
        categoryName: name,
        current: plain(d.current),
        previous: plain(d.previous),
        deltaAmount: plain(d.delta),
        deltaPercent: ((d.delta * 100) / d.previous).toFixed(1),
      },
      factRefs: [`category.${d.id}`],
      source: 'COMPUTED',
    });
  }

  const committed = w.invoices
    .filter((i) => i.status !== 'PAID')
    .reduce((sum, i) => sum + i.total - i.paid, 0);
  if (committed > 0)
    items.push({
      type: 'CARD_COMMITTED',
      key: 'insight.card.committed',
      params: { amount: plain(committed) },
      factRefs: ['cardOutstanding'],
      source: 'COMPUTED',
    });

  return { items, hasNext: false };
}
