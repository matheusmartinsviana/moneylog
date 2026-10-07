import {
  addDays,
  addMonths,
  daysInMonth,
  formatMasked,
  maskDigits,
  monthGrid,
  parseIso,
  parseMasked,
  weekday,
} from '~/app/common/components/calendar/calendar-math';

describe('calendar-math', () => {
  it.each([
    [2024, 2, 29],
    [2025, 2, 28],
    [2100, 2, 28],
    [2000, 2, 29],
    [2026, 4, 30],
  ])('Dado %i-%i, então tem %i dias', (y, m, days) => {
    expect(daysInMonth(y, m)).toBe(days);
  });

  it('Dado datas inexistentes, então parseIso devolve null', () => {
    expect(parseIso('2026-02-30')).toBeNull();
    expect(parseIso('2026-13-01')).toBeNull();
    expect(parseIso('2024-02-29')).toEqual({ y: 2024, m: 2, d: 29 });
  });

  it('Dado a virada de ano e mês, então addDays e addMonths calculam por dias civis', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
    expect(addMonths('2026-10-31', 12)).toBe('2027-10-31');
  });

  it('Dado a semana começando no domingo ou na segunda, então a grade alinha o dia 1', () => {
    // 2026-10-01 é quinta-feira.
    expect(weekday('2026-10-01')).toBe(4);
    expect(monthGrid('2026-10', 0)[0]?.indexOf('2026-10-01')).toBe(4);
    expect(monthGrid('2026-10', 1)[0]?.indexOf('2026-10-01')).toBe(3);
    expect(monthGrid('2026-10', 0)).toHaveLength(6);
  });

  it('Dado a máscara, então formata, valida e converte nas duas ordens', () => {
    expect(maskDigits('0510')).toBe('05/10');
    expect(maskDigits('05102026999')).toBe('05/10/2026');
    expect(formatMasked('2026-10-05', 'dmy')).toBe('05/10/2026');
    expect(formatMasked('2026-10-05', 'mdy')).toBe('10/05/2026');
    expect(parseMasked('05/10/2026', 'dmy')).toBe('2026-10-05');
    expect(parseMasked('10/05/2026', 'mdy')).toBe('2026-10-05');
    expect(parseMasked('31/02/2026', 'dmy')).toBeNull();
    expect(parseMasked('05/10/26', 'dmy')).toBeNull();
  });

  it('Dado a virada do horário de verão e anos bissextos, então a aritmética não depende do fuso', () => {
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2024-02-28', 2)).toBe('2024-03-01');
    expect(weekday('2026-10-04')).toBe(0);
  });
});
