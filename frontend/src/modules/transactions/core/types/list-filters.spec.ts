import {
  defaultFilters,
  filtersEqual,
  filtersFromQuery,
  filtersToQuery,
  monthBounds,
} from '~/modules/transactions/core/types/list-filters';

const TODAY = '2026-10-04';
const reader = (params: Record<string, string>) => (key: string) => params[key] ?? null;
const ACC = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('list-filters', () => {
  describe('monthBounds', () => {
    it.each([
      ['2026-10-04', '2026-10-01', '2026-10-31'],
      ['2026-02-15', '2026-02-01', '2026-02-28'],
      ['2028-02-15', '2028-02-01', '2028-02-29'],
      ['2026-12-31', '2026-12-01', '2026-12-31'],
      ['2026-04-30', '2026-04-01', '2026-04-30'],
    ])('Dado %s, então o mês vai de %s a %s', (date, from, to) => {
      expect(monthBounds(date)).toEqual({ from, to });
    });
  });

  it('Dado hoje, então os padrões são Registros do mês corrente, só ativas (S-71)', () => {
    expect(defaultFilters(TODAY)).toEqual({
      view: 'records',
      from: '2026-10-01',
      to: '2026-10-31',
      competence: '2026-10',
      lens: 'CONSUMPTION',
      type: null,
      accountId: null,
      categoryId: null,
      method: null,
      status: 'ACTIVE',
      q: '',
    });
  });

  it('Dado os padrões, então a URL fica vazia', () => {
    expect(filtersToQuery(defaultFilters(TODAY), TODAY)).toEqual({});
  });

  it('Dado filtros diferentes do padrão, então só eles vão para a URL e voltam iguais depois do F5', () => {
    const filters = {
      ...defaultFilters(TODAY),
      view: 'entries' as const,
      competence: '2026-09',
      lens: 'INCOME' as const,
      type: 'EXPENSE' as const,
      accountId: ACC,
      categoryId: ACC,
      method: 'PIX' as const,
      status: 'VOIDED' as const,
      from: '2026-09-01',
      to: '2026-09-30',
      q: 'café',
    };

    const query = filtersToQuery(filters, TODAY);
    const restored = filtersFromQuery(reader(query), TODAY);

    expect(Object.keys(query).sort()).toEqual(
      [
        'accountId',
        'categoryId',
        'competence',
        'from',
        'lens',
        'method',
        'q',
        'status',
        'to',
        'type',
        'view',
      ].sort(),
    );
    expect(restored).toEqual(filters);
  });

  it('Dado valores inválidos na URL, então voltam ao padrão sem quebrar', () => {
    const restored = filtersFromQuery(
      reader({
        view: 'x',
        from: '2026-13-01',
        to: 'ontem',
        competence: '2026-13',
        lens: 'Y',
        type: 'NOPE',
        accountId: 'nao-e-uuid',
        categoryId: '1',
        method: 'CREDIT',
        status: 'DELETED',
      }),
      TODAY,
    );

    expect(restored).toEqual(defaultFilters(TODAY));
  });

  it('Dado uma busca maior que o limite do contrato, então é cortada em 100 caracteres', () => {
    expect(filtersFromQuery(reader({ q: 'a'.repeat(150) }), TODAY).q).toHaveLength(100);
  });

  it('Dado filtros equivalentes, então filtersEqual ignora o que é só o padrão', () => {
    const a = defaultFilters(TODAY);
    expect(filtersEqual(a, { ...a }, TODAY)).toBe(true);
    expect(filtersEqual(a, { ...a, q: 'x' }, TODAY)).toBe(false);
    expect(filtersEqual(a, { ...a, q: '   ' }, TODAY)).toBe(true);
  });

  it('Dado o período aberto (from e to nulos), então vai para a URL como from= e to= vazios e volta nulo', () => {
    const open = { ...defaultFilters(TODAY), from: null, to: null };

    const query = filtersToQuery(open, TODAY);

    expect(query).toMatchObject({ from: '', to: '' });
    const restored = filtersFromQuery(reader(query), TODAY);
    expect(restored.from).toBeNull();
    expect(restored.to).toBeNull();
    expect(filtersEqual(open, defaultFilters(TODAY), TODAY)).toBe(false);
  });
});
