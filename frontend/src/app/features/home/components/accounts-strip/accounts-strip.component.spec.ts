import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';

import { pt } from '~/app/common/i18n/translations/pt';
import { AccountsStripComponent } from '~/app/features/home/components/accounts-strip/accounts-strip.component';
import { anAccount, brl } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { aCard } from '~/testing/cards-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';

const text = (el: HTMLElement) =>
  el.textContent
    ?.replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

async function setup(
  accounts = [anAccount({ id: 'acc-1', name: 'Nubank' })],
  cards: ReturnType<typeof aCard>[] = [],
) {
  return render(AccountsStripComponent, {
    providers: [provideI18nTesting('pt'), provideRouter([])],
    inputs: { accounts, cards },
  });
}

describe('AccountsStripComponent', () => {
  it('Dado as contas ativas, então cada uma é um link focável para /accounts/:id com o saldo do backend', async () => {
    await setup([
      anAccount({ id: 'acc-1', name: 'Nubank', currentBalance: brl('1234.56') }),
      anAccount({ id: 'acc-2', name: 'Carteira', type: 'WALLET', institution: null }),
    ]);

    const link = screen.getByTestId('home-account-acc-1');
    expect(link).toHaveAttribute('href', '/accounts/acc-1');
    expect(link).toHaveAttribute('aria-label', 'Abrir Nubank');
    expect(link).toHaveClass('lift');
    expect(text(screen.getByTestId('home-account-balance-acc-1'))).toBe('R$ 1.234,56');
    // Sem instituição, mostra o tipo da conta.
    expect(text(screen.getByTestId('home-account-acc-2'))).toContain(pt.accounts.types.WALLET);
  });

  it('Dado o tipo, então o tom da identidade deriva dele (sem campo appearance)', async () => {
    await setup([
      anAccount({ id: 'a', type: 'CHECKING' }),
      anAccount({ id: 'b', type: 'SAVINGS' }),
      anAccount({ id: 'c', type: 'WALLET' }),
      anAccount({ id: 'd', type: 'INVESTMENT', liquidity: 'INVESTMENT' }),
    ]);

    expect(
      ['a', 'b', 'c', 'd'].map((id) => screen.getByTestId(`home-account-${id}`).dataset['tone']),
    ).toEqual(['accent', 'positive', 'warning', 'neutral']);
  });

  it('Dado saldo negativo, então o valor leva o sinal e o tom de risco; dado reserva descoberta, o aviso em texto', async () => {
    await setup([anAccount({ id: 'acc-1', currentBalance: brl('-80.00'), uncovered: true })]);

    const balance = screen.getByTestId('home-account-balance-acc-1');
    expect(text(balance)).toBe('−R$ 80,00');
    expect(balance).toHaveClass('is-negative');
    expect(screen.getByTestId('home-account-uncovered-acc-1')).toHaveTextContent(
      pt.accounts.uncovered,
    );
  });

  it('Dado um cartão, então aparece como "Fatura atual" (nunca como saldo negativo de conta) com os valores do backend', async () => {
    const card = aCard({ id: 'card-1', name: 'Roxinho', availableLimit: brl('7717.00') });
    await setup([anAccount()], [card]);

    const tile = screen.getByTestId('home-card-tile-card-1');
    expect(tile).toHaveAttribute('href', '/cards/card-1');
    expect(text(tile)).toContain(pt.dashboard.accounts.invoiceTitle);
    expect(text(tile)).toContain('R$ 7.717,00');
    expect(text(screen.getByTestId('home-card-invoice-card-1'))).not.toMatch(/^[−-]/);
  });

  it('Dado cartão sem fatura aberta, então diz isso e não mostra valor de fatura', async () => {
    await setup([anAccount()], [aCard({ id: 'card-1', currentInvoice: null })]);

    expect(screen.getByTestId('home-card-tile-card-1')).toHaveTextContent(
      pt.dashboard.accounts.noInvoice,
    );
    expect(screen.queryByTestId('home-card-invoice-card-1')).not.toBeInTheDocument();
  });

  it('Dado cartão acima do limite, então o texto diz "acima do limite" (não só a cor)', async () => {
    await setup([anAccount()], [aCard({ id: 'card-1', overLimit: true })]);
    expect(screen.getByTestId('home-card-tile-card-1')).toHaveTextContent(
      pt.dashboard.accounts.overLimit,
    );
  });

  it('Dado o strip, então não há violações de acessibilidade e o grupo tem nome', async () => {
    const { container } = await setup([anAccount()], [aCard()]);
    expect(screen.getByRole('list', { name: pt.dashboard.accounts.listLabel })).toBeInTheDocument();
    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
