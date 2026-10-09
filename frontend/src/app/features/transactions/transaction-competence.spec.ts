import { describe, expect, it } from 'vitest';

import { incomeMonthNote } from '~/app/features/transactions/transaction-competence';

const TEMPLATE = 'Renda de {month} (recebida em {date})';

describe('incomeMonthNote', () => {
  it('Dado uma renda de outro mês, Quando há competência, Então devolve o rótulo com mês e data', () => {
    const note = incomeMonthNote(
      { date: '2026-09-16', incomeCompetence: '2026-10' },
      TEMPLATE,
      'pt-BR',
    );
    expect(note).toContain('outubro');
    expect(note).toContain('16 de set.');
  });

  it('Dado competência nula ou igual ao mês da data, Então não há rótulo', () => {
    expect(
      incomeMonthNote({ date: '2026-09-16', incomeCompetence: null }, TEMPLATE, 'pt-BR'),
    ).toBeNull();
    expect(
      incomeMonthNote({ date: '2026-09-16', incomeCompetence: '2026-09' }, TEMPLATE, 'pt-BR'),
    ).toBeNull();
  });
});
