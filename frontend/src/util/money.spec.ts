import { formatMoney, isNegative, TYPOGRAPHIC_MINUS } from '~/util/money';

/** O Intl usa espaço não separável entre símbolo e número; normaliza para comparar. */
const plain = (value: string) => value.replace(/\u00a0/g, ' ');

describe('formatMoney', () => {
  it('Dado BRL, quando formato, então usa o locale pt-BR do dado', () => {
    expect(plain(formatMoney({ amount: '1234.56', currency: 'BRL' }))).toBe('R$ 1.234,56');
  });

  it('Dado USD, quando formato, então usa o locale en-US do dado', () => {
    expect(formatMoney({ amount: '1234.56', currency: 'USD' })).toBe('$1,234.56');
  });

  it('Dado um valor negativo, então exibe o sinal de menos tipográfico (U+2212), não o hífen', () => {
    const formatted = plain(formatMoney({ amount: '-1234.56', currency: 'BRL' }));
    expect(formatted).toBe(`${TYPOGRAPHIC_MINUS}R$ 1.234,56`);
    expect(formatted).not.toContain('-');
  });

  it('Dado "0.10" e "0.20", então cada um é exibido separadamente, sem somar', () => {
    expect(plain(formatMoney({ amount: '0.10', currency: 'BRL' }))).toBe('R$ 0,10');
    expect(plain(formatMoney({ amount: '0.20', currency: 'BRL' }))).toBe('R$ 0,20');
  });

  it('Dado um valor além da precisão do number, então formata exatamente (não converte para number)', () => {
    expect(plain(formatMoney({ amount: '123456789012345678.91', currency: 'BRL' }))).toBe(
      'R$ 123.456.789.012.345.678,91',
    );
  });

  it('Dado mais casas que a moeda usa, então não arredonda', () => {
    expect(plain(formatMoney({ amount: '1.005', currency: 'BRL' }))).toBe('R$ 1,005');
  });

  it('Dado um inteiro, então completa as casas da moeda', () => {
    expect(plain(formatMoney({ amount: '1200', currency: 'BRL' }))).toBe('R$ 1.200,00');
  });

  it('Dado um valor fora do contrato, então devolve o dado cru para o erro ficar visível', () => {
    expect(formatMoney({ amount: '12,50', currency: 'BRL' })).toBe('12,50 BRL');
    expect(formatMoney({ amount: '1.00', currency: 'real' })).toBe('1.00 real');
  });
});

describe('isNegative', () => {
  it.each([
    ['-0.01', true],
    ['-250.00', true],
    ['0.00', false],
    ['-0.00', false],
    ['12.50', false],
  ])('Dado %s, então lê só o sinal e responde %s', (amount, expected) => {
    expect(isNegative({ amount, currency: 'BRL' })).toBe(expected);
  });
});
