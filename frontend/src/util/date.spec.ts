import {
  formatCompetence,
  formatCompetenceShort,
  formatInstant,
  formatIsoDate,
  isIsoDate,
  nextMonthOf,
  relativeDay,
  todayIso,
  USER_TIME_ZONE,
} from '~/util/date';

describe('formatIsoDate', () => {
  it('Dado uma data da API, quando formato em pt-BR, então mostra dia e mês curtos sem mudar o dia', () => {
    expect(formatIsoDate('2026-10-05', 'pt-BR')).toBe('5 de out.');
  });

  it('Dado o estilo longo, então inclui o ano no idioma pedido', () => {
    expect(formatIsoDate('2026-10-10', 'pt-BR', 'long')).toBe('10 de outubro de 2026');
    expect(formatIsoDate('2026-10-10', 'en', 'long')).toBe('October 10, 2026');
  });

  it('Dado o primeiro dia do ano, então não "volta" para o ano anterior por causa do fuso', () => {
    expect(formatIsoDate('2027-01-01', 'pt-BR', 'long')).toBe('1 de janeiro de 2027');
  });

  it('Dado um valor fora do formato, então devolve como veio', () => {
    expect(formatIsoDate('10/10/2026', 'pt-BR')).toBe('10/10/2026');
  });
});

describe('formatCompetence', () => {
  it('Dado uma competência, então mostra mês e ano no idioma', () => {
    expect(formatCompetence('2026-10', 'pt-BR')).toBe('outubro de 2026');
    expect(formatCompetence('2026-10', 'es')).toBe('octubre de 2026');
  });

  it('Dado um valor fora do formato, então devolve como veio', () => {
    expect(formatCompetence('2026', 'pt-BR')).toBe('2026');
  });
});

describe('todayIso', () => {
  afterEach(() => vi.useRealTimers());

  it('Dado o relógio às 23:30 de 31/10 em São Paulo (02:30 de 01/11 em UTC), então hoje ainda é 31/10', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T02:30:00Z'));

    expect(todayIso()).toBe('2026-10-31');
  });

  it('Dado o mesmo instante, então o fuso do usuário é America/Sao_Paulo e não o UTC', () => {
    const instant = new Date('2026-11-01T02:30:00Z');

    expect(USER_TIME_ZONE).toBe('America/Sao_Paulo');
    expect(todayIso(instant)).toBe('2026-10-31');
    expect(todayIso(instant, 'UTC')).toBe('2026-11-01');
  });

  it('Dado meia-noite e meia em São Paulo, então já é o dia seguinte', () => {
    expect(todayIso(new Date('2026-11-01T03:30:00Z'))).toBe('2026-11-01');
  });
});

describe('isIsoDate', () => {
  it.each(['2026-10-31', '2028-02-29'])('Dado %s, então é data válida', (value) => {
    expect(isIsoDate(value)).toBe(true);
  });

  it.each(['2026-02-30', '2026-13-01', '31/10/2026', '', '2026-1-1'])(
    'Dado "%s", então não é data válida',
    (value) => {
      expect(isIsoDate(value)).toBe(false);
    },
  );
});

describe('formatCompetenceShort e formatInstant', () => {
  it('Dado 2026-10, então vira out/2026 em pt-BR e oct/2026 em inglês', () => {
    expect(formatCompetenceShort('2026-10', 'pt-BR')).toBe('out/2026');
    expect(formatCompetenceShort('2026-10', 'en')).toBe('oct/2026');
  });

  it('Dado valor fora do formato, então volta como veio', () => {
    expect(formatCompetenceShort('out', 'pt-BR')).toBe('out');
    expect(formatInstant('não é data', 'pt-BR')).toBe('não é data');
  });

  it('Dado um instante UTC de madrugada, então mostra a data no fuso de São Paulo', () => {
    // 02:30 UTC de 05/10 ainda é 23:30 de 04/10 em São Paulo.
    expect(formatInstant('2026-10-05T02:30:00Z', 'pt-BR')).toMatch(/4 de outubro de 2026/);
  });
});

describe('nextMonthOf', () => {
  it('Dado uma data ou competência, então devolve o mês seguinte, inclusive na virada do ano', () => {
    expect(nextMonthOf('2026-09-16')).toBe('2026-10');
    expect(nextMonthOf('2026-12')).toBe('2027-01');
  });
});

describe('relativeDay', () => {
  it('Dado o asOf do backend, então hoje e ontem são rótulos e o resto é null', () => {
    expect(relativeDay('2026-10-10', '2026-10-10')).toBe('today');
    expect(relativeDay('2026-10-09', '2026-10-10')).toBe('yesterday');
    expect(relativeDay('2026-10-08', '2026-10-10')).toBeNull();
    expect(relativeDay('2026-10-11', '2026-10-10')).toBeNull();
  });

  it('Dado a virada de mês e de ano, então ontem continua certo', () => {
    expect(relativeDay('2026-09-30', '2026-10-01')).toBe('yesterday');
    expect(relativeDay('2025-12-31', '2026-01-01')).toBe('yesterday');
  });

  it('Dado data inválida, então null', () => {
    expect(relativeDay('2026-02-30', '2026-03-01')).toBeNull();
    expect(relativeDay('abc', '2026-03-01')).toBeNull();
  });
});
