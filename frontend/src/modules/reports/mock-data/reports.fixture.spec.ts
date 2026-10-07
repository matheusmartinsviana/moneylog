import { demoIncomeExpenseSeries } from '~/modules/reports/mock-data/income-expenses.fixture';
import { demoSpendingByCategory } from '~/modules/reports/mock-data/spending-by-category.fixture';

/**
 * Valores **escritos à mão** (e conferidos na calculadora), não recalculados aqui: um teste que refaz a mesma
 * aritmética da fixture para conferir a própria fixture só repetiria um erro dela (revisão M7). Os casos
 * "regressão" são valores fixados da saída atual (sem derivação manual possível em 12 meses de dias).
 */
describe('fixtures de demonstração dos relatórios (formato do contrato 2.6.0, plano 5.1 e 5.2)', () => {
  it('Dado D7, então cada dia, o total e o resultado batem com os valores fixos', () => {
    const series = demoIncomeExpenseSeries('D7');

    expect(
      series.points.map((p) => [p.periodStart, p.income.amount, p.expenses.amount, p.net.amount]),
    ).toEqual([
      ['2026-10-04', '0.00', '43.70', '-43.70'],
      ['2026-10-05', '0.00', '942.89', '-942.89'],
      ['2026-10-06', '0.00', '0.00', '0.00'],
      ['2026-10-07', '0.00', '166.27', '-166.27'],
      ['2026-10-08', '0.00', '90.46', '-90.46'],
      ['2026-10-09', '0.00', '79.65', '-79.65'],
      ['2026-10-10', '0.00', '0.00', '0.00'],
    ]);
    // 43,70 + 942,89 + 166,27 + 90,46 + 79,65 = 1.322,97 (conta feita à mão).
    expect(series.totals).toEqual({
      income: { amount: '0.00', currency: 'BRL' },
      expenses: { amount: '1322.97', currency: 'BRL' },
      net: { amount: '-1322.97', currency: 'BRL' },
    });
  });

  it('Dado M12, então a 1ª competência e a corrente têm os valores fixos (7.240,00 − 2.916,21 = 4.323,79)', () => {
    const { points, totals } = demoIncomeExpenseSeries('M12');

    expect(points[0]).toMatchObject({
      periodStart: '2025-11-01',
      periodEnd: '2025-11-30',
      income: { amount: '7240.00' },
      expenses: { amount: '2916.21' },
      net: { amount: '4323.79' },
    });
    expect(points.at(-1)).toMatchObject({
      periodStart: '2026-10-01',
      income: { amount: '7240.00' },
      expenses: { amount: '2871.64' },
      net: { amount: '4368.36' },
    });
    // Regressão: totais dos 12 meses, valores fixados da saída atual.
    expect(totals.income.amount).toBe('86340.00');
    expect(totals.expenses.amount).toBe('34313.97');
    expect(totals.net.amount).toBe('52026.03');
  });

  it('Dado D30 e M3, então os totais fixos (regressão) e o resultado = receita − consumo escrito à mão', () => {
    expect(demoIncomeExpenseSeries('D30').totals).toMatchObject({
      income: { amount: '7060.00' },
      expenses: { amount: '2788.60' },
      net: { amount: '4271.40' }, // 7.060,00 − 2.788,60
    });
    expect(demoIncomeExpenseSeries('M3').totals).toMatchObject({
      income: { amount: '21540.00' },
      expenses: { amount: '8737.90' },
      net: { amount: '12802.10' }, // 21.540,00 − 8.737,90
    });
  });

  it('Dado D7 e D30, então 7 e 30 pontos densos terminando hoje, o último parcial, base DATE', () => {
    const d7 = demoIncomeExpenseSeries('D7');
    const d30 = demoIncomeExpenseSeries('D30');

    expect(d7.points).toHaveLength(7);
    expect(d30.points).toHaveLength(30);
    for (const series of [d7, d30]) {
      expect(series.granularity).toBe('DAY');
      expect(series.basis).toBe('DATE');
      expect(series.to).toBe('2026-10-10');
      expect(series.points.at(-1)).toMatchObject({ periodEnd: '2026-10-10', partial: true });
      expect(series.points.slice(0, -1).every((point) => !point.partial)).toBe(true);
      expect(series.points[0]!.periodStart).toBe(series.from);
    }
    expect(d7.from).toBe('2026-10-04');
    expect(d30.from).toBe('2026-09-11');
  });

  it('Dado M3, então semanas recortadas na janela (13 ou 14 pontos), sem buraco nem sobreposição', () => {
    const m3 = demoIncomeExpenseSeries('M3');

    expect(m3.granularity).toBe('WEEK');
    expect(m3.from).toBe('2026-07-10');
    expect([13, 14]).toContain(m3.points.length);
    expect(m3.points[0]!.periodStart).toBe('2026-07-10'); // recortado: não começa na segunda anterior
    expect(m3.points.at(-1)).toMatchObject({ periodEnd: '2026-10-10', partial: true });
    m3.points.slice(1).forEach((point, i) => {
      const previous = new Date(`${m3.points[i]!.periodEnd}T00:00:00Z`).getTime();
      expect(new Date(`${point.periodStart}T00:00:00Z`).getTime() - previous).toBe(86_400_000);
    });
  });

  it('Dado M12, então 12 competências terminando na corrente, que é a inteira e parcial', () => {
    const m12 = demoIncomeExpenseSeries('M12');

    expect(m12.granularity).toBe('MONTH');
    expect(m12.basis).toBe('COMPETENCE');
    expect(m12.points).toHaveLength(12);
    expect(m12.points[0]!.periodStart).toBe('2025-11-01');
    expect(m12.points.at(-1)).toMatchObject({
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      partial: true,
    });
  });

  it('Dado D30, então há ao menos um dia só com reembolso (consumo negativo) e dias sem movimento', () => {
    const { points } = demoIncomeExpenseSeries('D30');

    expect(points.find((p) => p.periodStart === '2026-09-23')?.expenses.amount).toBe('-49.90');
    expect(points.find((p) => p.periodStart === '2026-09-24')?.expenses.amount).toBe('0.00');
  });

  it('Dado os gastos por categoria, então os valores, a ordem e as razões são os fixos', () => {
    const data = demoSpendingByCategory('2026-10', 5);

    // 1.820,00 + 820,00 + 610,00 + 420,00 + 240,00 + 90,00 + 85,50 = 4.085,50 (conta feita à mão).
    expect(data.total).toEqual({ amount: '4085.50', currency: 'BRL' });
    expect(data.base).toEqual({ amount: '4085.50', currency: 'BRL' });
    expect(data.items.map((i) => [i.category.name, i.amount.amount, i.share])).toEqual([
      ['Moradia', '1820.00', '0.4455'], // 1820 / 4085,5 = 0,44547
      ['Alimentação', '820.00', '0.2007'], // 0,20071
      ['Compras', '610.00', '0.1493'], // 0,14931
      ['Transporte', '420.00', '0.1028'], // 0,10280
      ['Assinaturas', '240.00', '0.0587'], // 0,05874
    ]);
    // Lazer 90,00 + Saúde 85,50 = 175,50, 175,5 / 4085,5 = 0,04296
    expect(data.other).toEqual({
      amount: { amount: '175.50', currency: 'BRL' },
      share: '0.0430',
      categories: 2,
    });
    expect(data.from).toBe('2026-10-01');
    expect(data.to).toBe('2026-10-31');
  });

  it('Dado limit 7, então todas viram item e other é nulo', () => {
    const data = demoSpendingByCategory('2026-10', 7);

    expect(data.items).toHaveLength(7);
    expect(data.other).toBeNull();
  });
});
