import {
  amountScale,
  currencySymbol,
  decimalSymbols,
  formatAmountInput,
  normalizeAmount,
  parseAmountInput,
} from '~/util/money-input';

describe('parseAmountInput (BRL, separadores pt-BR)', () => {
  it.each([
    ['1.234,5', '1234.50'],
    ['1.234,56', '1234.56'],
    ['1234,56', '1234.56'],
    ['0,1', '0.10'],
    ['0,2', '0.20'],
    [',5', '0.50'],
    ['18', '18.00'],
    ['18,', '18.00'],
    ['007,50', '7.50'],
    ['12.345.678,90', '12345678.90'],
    ['R$ 1.234,56', '1234.56'],
    ['  9,9  ', '9.90'],
    ['1 234,56', '1234.56'],
    // Teclado decimal de aparelho em outro idioma: um ponto seguido de 1 ou 2 dígitos é decimal.
    ['18.5', '18.50'],
    ['18.50', '18.50'],
    // Com 3 dígitos depois do ponto, é separador de milhar.
    ['1.234', '1234.00'],
    ['1.500', '1500.00'],
    ['0.500', '500.00'],
    ['1.5', '1.50'],
    ['99999999999999999999,99', '99999999999999999999.99'],
  ])('Dado "%s", então o valor é a string "%s"', (text, expected) => {
    expect(parseAmountInput(text, 'BRL')).toEqual({ ok: true, value: expected });
  });

  it.each([
    ['', 'required'],
    ['   ', 'required'],
    ['abc', 'format'],
    ['12a', 'format'],
    ['1,2,3', 'format'],
    ['1.23,45', 'format'],
    ['1.234.5', 'format'],
    ['12,3.4', 'format'],
    ['-', 'format'],
    ['1-2', 'format'],
    ['1e3', 'format'],
    ['12,345', 'scale'],
    ['0,001', 'scale'],
    ['0', 'zero'],
    ['0,00', 'zero'],
    ['-5', 'negative'],
    ['−5,00', 'negative'],
  ])('Dado "%s", então é inválido por %s', (text, error) => {
    expect(parseAmountInput(text, 'BRL')).toEqual({ ok: false, error });
  });

  it('Dado as regras do saldo inicial, então aceita zero e negativo', () => {
    const rules = { allowNegative: true, allowZero: true };

    expect(parseAmountInput('0', 'BRL', rules)).toEqual({ ok: true, value: '0.00' });
    expect(parseAmountInput('-1.234,5', 'BRL', rules)).toEqual({ ok: true, value: '-1234.50' });
    expect(parseAmountInput('−7', 'BRL', rules)).toEqual({ ok: true, value: '-7.00' });
    expect(parseAmountInput('-0', 'BRL', rules)).toEqual({ ok: true, value: '0.00' });
  });

  it('Dado zero negativo sem permitir zero, então o erro é zero (e não negativo)', () => {
    expect(parseAmountInput('-0', 'BRL')).toEqual({ ok: false, error: 'zero' });
  });

  it('Dado o parse e a formatação, então nenhum number entra no caminho (sem parseFloat, parseInt nem Number)', () => {
    const parseFloatSpy = vi.spyOn(globalThis, 'parseFloat');
    const parseIntSpy = vi.spyOn(globalThis, 'parseInt');
    const numberSpy = vi.spyOn(globalThis, 'Number');

    const first = parseAmountInput('0,1', 'BRL');
    const second = parseAmountInput('0,2', 'BRL');
    const shown = formatAmountInput('1234.50', 'BRL');
    const calls = [parseFloatSpy, parseIntSpy, numberSpy].map((spy) => spy.mock.calls.length);
    vi.restoreAllMocks();

    expect(calls).toEqual([0, 0, 0]);
    expect(first).toEqual({ ok: true, value: '0.10' });
    expect(second).toEqual({ ok: true, value: '0.20' });
    expect(typeof shown).toBe('string');
    expect(shown).toBe('1.234,50');
  });
});

describe('parseAmountInput (USD, separadores en-US)', () => {
  it.each([
    ['1,234.5', '1234.50'],
    ['18,5', '18.50'],
    ['$12.34', '12.34'],
  ])('Dado "%s", então o valor é "%s"', (text, expected) => {
    expect(parseAmountInput(text, 'USD')).toEqual({ ok: true, value: expected });
  });

  it('Dado "1.234,5" em USD, então é formato inválido', () => {
    expect(parseAmountInput('1.234,5', 'USD')).toEqual({ ok: false, error: 'format' });
  });
});

describe('normalizeAmount', () => {
  it.each([
    ['1234.5', '1234.50'],
    ['1234', '1234.00'],
    ['0.10', '0.10'],
  ])('Dado o valor do modelo "%s", então normaliza para "%s"', (value, expected) => {
    expect(normalizeAmount(value, 'BRL')).toEqual({ ok: true, value: expected });
  });

  it.each([
    [null, 'required'],
    [undefined, 'required'],
    ['', 'required'],
    ['1,5', 'format'],
    ['1.234', 'scale'],
    ['0.00', 'zero'],
    ['-3.00', 'negative'],
  ] as const)('Dado %s, então é inválido por %s', (value, error) => {
    expect(normalizeAmount(value, 'BRL')).toEqual({ ok: false, error });
  });

  it('Dado as regras do saldo inicial, então aceita negativo', () => {
    expect(normalizeAmount('-3', 'BRL', { allowNegative: true })).toEqual({
      ok: true,
      value: '-3.00',
    });
  });
});

describe('formatAmountInput e símbolos', () => {
  it('Dado um valor canônico em BRL, então exibe com os separadores de pt-BR e sem símbolo', () => {
    expect(formatAmountInput('1234.50', 'BRL')).toBe('1.234,50');
    expect(formatAmountInput('12345678.90', 'BRL')).toBe('12.345.678,90');
    expect(formatAmountInput('0.10', 'BRL')).toBe('0,10');
  });

  it('Dado um valor com muitos dígitos, então não perde precisão', () => {
    expect(formatAmountInput('99999999999999999999.99', 'BRL')).toBe(
      '99.999.999.999.999.999.999,99',
    );
  });

  it('Dado USD, então usa os separadores de en-US', () => {
    expect(formatAmountInput('1234.50', 'USD')).toBe('1,234.50');
    expect(decimalSymbols('USD')).toEqual({ decimal: '.', group: ',' });
  });

  it('Dado BRL, então o símbolo é R$, as casas são 2 e os separadores são , e .', () => {
    expect(currencySymbol('BRL')).toBe('R$');
    expect(amountScale('BRL')).toBe('2');
    expect(decimalSymbols('BRL')).toEqual({ decimal: ',', group: '.' });
  });
});
