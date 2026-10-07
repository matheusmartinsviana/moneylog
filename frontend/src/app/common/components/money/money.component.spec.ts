import { render, screen } from '@testing-library/angular';

import { MoneyComponent } from '~/app/common/components/money/money.component';
import { provideI18nTesting } from '~/testing/i18n-testing';

describe('MoneyComponent', () => {
  it('Dado BRL com a UI em inglês, quando renderizo, então exibe R$ 1.234,56 com números tabulares', async () => {
    const errors = vi.spyOn(console, 'error');
    await render(MoneyComponent, {
      inputs: { value: { amount: '1234.56', currency: 'BRL' } },
      providers: [provideI18nTesting('en')],
    });

    const value = screen.getByTestId('money-value');
    expect(value.textContent?.replace(/\u00a0/g, ' ')).toBe('R$ 1.234,56');
    expect(value).toHaveClass('num');
    expect(getComputedStyle(value).fontVariantNumeric).toBe('tabular-nums');
    expect(errors).not.toHaveBeenCalled();
  });

  it('Dado um valor negativo, então exibe o menos tipográfico', async () => {
    await render(MoneyComponent, {
      inputs: { value: { amount: '-0.10', currency: 'BRL' } },
      providers: [provideI18nTesting('pt')],
    });

    expect(screen.getByTestId('money-value').textContent?.replace(/\u00a0/g, ' ')).toBe(
      '\u2212R$ 0,10',
    );
  });
});
