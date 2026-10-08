import { currentPeriod, isoWeekPeriod, parsePeriod } from '~/util/period';

describe('period', () => {
  it('Dado datas em viradas de ano, Quando calcula a semana ISO, Então segue a regra da quinta-feira', () => {
    expect(isoWeekPeriod('2026-10-08')).toBe('2026-W41');
    expect(isoWeekPeriod('2026-01-01')).toBe('2026-W01');
    expect(isoWeekPeriod('2027-01-01')).toBe('2026-W53');
    expect(isoWeekPeriod('2024-12-30')).toBe('2025-W01');
  });

  it('Dado cada frequência, Quando pede o período atual, Então devolve o formato do contrato', () => {
    expect(currentPeriod('MONTHLY', '2026-10-08')).toBe('2026-10');
    expect(currentPeriod('WEEKLY', '2026-10-08')).toBe('2026-W41');
    expect(currentPeriod('ONE_TIME', '2026-10-08')).toBe('ONCE');
  });

  it('Dado um período, Quando interpreta, Então separa tipo, ano e número', () => {
    expect(parsePeriod('2026-09')).toEqual({ kind: 'month', year: 2026, number: 9 });
    expect(parsePeriod('2026-W05')).toEqual({ kind: 'week', year: 2026, number: 5 });
    expect(parsePeriod('ONCE').kind).toBe('once');
    expect(parsePeriod('x').kind).toBe('unknown');
  });
});
