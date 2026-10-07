import { interpolate } from '~/app/common/i18n/interpolate';

describe('interpolate', () => {
  it('Dado um texto com parâmetros, então preenche cada um', () => {
    expect(interpolate('Vence em {date}', { date: '5 de out.' })).toBe('Vence em 5 de out.');
  });

  it('Dado um parâmetro ausente, então ele fica visível', () => {
    expect(interpolate('Posição de {date}.', {})).toBe('Posição de {date}.');
  });
});
