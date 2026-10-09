import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NEVER, of } from 'rxjs';

import { App } from '~/app/app';
import { ViewportService } from '~/app/common/components/overlay/viewport.service';
import { pt } from '~/app/common/i18n/translations/pt';
import { CardPage } from '~/app/features/cards/pages/card.page';
import {
  AccountsGatewayStub,
  anAccount,
  brl,
  failWith,
  provideAccountsStub,
} from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import {
  aCard,
  anInvoice,
  anInvoiceItem,
  anInvoiceSummary,
  CardsGatewayStub,
  provideCardsStub,
} from '~/testing/cards-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { provideNotesStub } from '~/testing/notes-testing';

vi.setConfig({ testTimeout: 20_000 });

@Component({ selector: 'app-dummy', template: '' })
class DummyComponent {}

const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, ' ').trim();

/** O cenário padrão: fatura corrente 1.283,00, 1.000,00 em parcelas futuras, disponível 7.717,00. */
function scenario(): CardsGatewayStub {
  const gateway = new CardsGatewayStub();
  gateway.cards = [aCard()];
  gateway.invoices = [
    anInvoiceSummary({
      id: 'inv-dez',
      referenceMonth: '2026-12',
      periodStart: '2026-11-25',
      closingDate: '2026-12-25',
      dueDate: '2027-01-05',
      status: 'FUTURE',
      total: brl('200.00'),
      outstanding: brl('200.00'),
    }),
    anInvoiceSummary({
      id: 'inv-nov',
      referenceMonth: '2026-11',
      status: 'CLOSED',
      hasLateEntries: true,
      outstanding: brl('1283.00'),
    }),
  ];
  gateway.future$ = of({
    total: brl('1000.00'),
    byInvoice: [
      {
        invoiceId: 'inv-dez',
        referenceMonth: '2026-12',
        dueDate: '2027-01-05',
        amount: brl('200.00'),
        items: [anInvoiceItem({ transactionId: 'tx-nb', number: 2, amount: brl('200.00') })],
      },
    ],
  });
  return gateway;
}

async function setup(
  gateway = scenario(),
  { url = '/cards/card-1', compact = false }: { url?: string; compact?: boolean } = {},
) {
  const accounts = new AccountsGatewayStub();
  accounts.accounts = [anAccount({ id: 'acc-1', name: 'Nubank' })];
  const result = await render(App, {
    initialRoute: url,
    providers: [
      provideRouter(
        [
          { path: 'cards/:id', component: CardPage },
          { path: 'cards/:id/edit', component: DummyComponent },
          { path: 'cards/:id/invoices/:invoiceId', component: DummyComponent },
          { path: 'quick-add', component: DummyComponent },
          { path: 'cards', component: DummyComponent },
        ],
        withComponentInputBinding(),
      ),
      provideI18nTesting('pt'),
      provideNotesStub(),
      provideCardsStub(gateway),
      provideAccountsStub(accounts),
      { provide: ViewportService, useValue: { compact: signal(compact) } },
    ],
  });
  await result.fixture.whenStable();
  return { ...result, gateway, router: TestBed.inject(Router) };
}

describe('CardPage', () => {
  it('Dado a tela, então mostra o bloco de notas vinculadas ao registro (a página injeta o bloco; nenhum módulo importa notes)', async () => {
    await setup();

    // As notas ligadas moram em "Mais" (recolhido e montado só ao abrir).
    await userEvent.click(await screen.findByTestId('card-more-toggle'));
    expect(await screen.findByTestId('card-notes-block')).toHaveTextContent('Notas vinculadas');
    expect(screen.getByTestId('card-notes-new')).toBeInTheDocument();
  });

  it('Dado o cenário, então o cabeçalho mostra comprometido futuro, total comprometido e disponível, todos do backend', async () => {
    await setup();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Roxinho');
    expect(text(screen.getByTestId('card-committed-future'))).toBe(
      'Você já comprometeu R$ 1.000,00 em compras futuras.',
    );
    expect(text(screen.getByTestId('card-total-committed'))).toBe('R$ 1.283,00');
    expect(text(screen.getByTestId('card-available'))).toBe('R$ 7.717,00');
    expect(screen.getByTestId('card-header')).toHaveTextContent(
      pt.cards.detail.totalCommittedLabel,
    );
    expect(text(screen.getByTestId('card-days'))).toBe('Fecha no dia 25 e vence no dia 5.');
  });

  it('Dado os números que não fecham, então a tela não soma nem corrige (disponível ≠ limite − comprometidos)', async () => {
    const gateway = scenario();
    gateway.cards = [
      aCard({
        availableLimit: brl('1.00'),
        totalCommitted: brl('2.00'),
        committedFuture: brl('3.00'),
      }),
    ];
    await setup(gateway);

    expect(text(screen.getByTestId('card-available'))).toBe('R$ 1,00');
    expect(text(screen.getByTestId('card-total-committed'))).toBe('R$ 2,00');
    expect(text(screen.getByTestId('card-committed-future'))).toContain('R$ 3,00');
    expect(screen.getByTestId('card-header')).not.toHaveTextContent('R$ 5,00');
  });

  it('Dado a lista de faturas, então cada linha mostra referência, período, fechamento, vencimento, situação em texto e outstanding', async () => {
    await setup();

    const row = screen.getByTestId('invoice-row-inv-nov');
    expect(row).toHaveTextContent('Fatura de nov/2026');
    const dates = screen.getByTestId('invoice-dates-inv-nov');
    expect(dates).toHaveTextContent('Período: 25 de set. a 25 de out.');
    expect(dates).toHaveTextContent('Fecha em 25 de out.');
    expect(dates).toHaveTextContent('Vence em 5 de nov.');
    expect(within(row).getByTestId('invoice-status')).toHaveTextContent('Fechada');
    expect(within(row).getByTestId('invoice-status')).toHaveAttribute('data-status', 'CLOSED');
    expect(text(screen.getByTestId('invoice-outstanding-inv-nov'))).toBe('R$ 1.283,00');
    expect(
      within(screen.getByTestId('invoice-row-inv-dez')).getByTestId('invoice-status'),
    ).toHaveTextContent('Futura');
    expect(screen.getByTestId('invoice-open-inv-nov')).toHaveAttribute(
      'href',
      '/cards/card-1/invoices/inv-nov',
    );
  });

  it('Dado uma fatura com lançamento tardio, então aparece o indicador com a explicação visível', async () => {
    await setup();

    expect(screen.getByTestId('invoice-late-inv-nov')).toHaveTextContent(
      'Inclui lançamento tardio. O banco já tinha cobrado algum item nesta fatura.',
    );
    expect(screen.queryByTestId('invoice-late-inv-dez')).not.toBeInTheDocument();
  });

  it('Dado nenhuma fatura, então estado vazio da aba; erro nas faturas, "tentar de novo" sem esconder o cartão', async () => {
    const gateway = scenario();
    gateway.invoices = [];
    await setup(gateway);
    expect(screen.getByTestId('invoices-empty')).toHaveTextContent(pt.cards.detail.invoicesEmpty);
  });

  it('Dado erro nas faturas, então a aba mostra o erro e o cabeçalho continua', async () => {
    const gateway = scenario();
    gateway.invoicesResult = failWith(500, 'INTERNAL_ERROR');
    await setup(gateway);

    expect(
      within(screen.getByTestId('card-tabs-panel-invoices')).getByTestId('error-state'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('card-header')).toBeInTheDocument();
  });

  it('Dado a aba "Parcelas futuras", então lista byInvoice com os itens e o total do backend', async () => {
    const { router } = await setup();

    await userEvent.click(screen.getByTestId('card-tabs-tab-future'));

    expect(await screen.findByTestId('future-total')).toHaveTextContent('R$ 1.000,00');
    const group = screen.getByTestId('future-invoice-inv-dez');
    expect(group).toHaveTextContent('Fatura de dez/2026, vence 5 de jan.');
    expect(text(screen.getByTestId('future-invoice-amount-inv-dez'))).toBe('R$ 200,00');
    const item = within(group).getByTestId('future-item');
    expect(item).toHaveTextContent('Notebook 2/6');
    expect(item).toHaveTextContent('R$ 200,00');
    expect(router.url).toBe('/cards/card-1?tab=future');
  });

  it('Dado "?tab=future" na URL, então abre direto nas parcelas futuras', async () => {
    const gateway = scenario();
    await setup(gateway, { url: '/cards/card-1?tab=future' });

    expect(screen.getByTestId('card-tabs-tab-future')).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByTestId('future-total')).toBeInTheDocument();
    expect(gateway.calls).toContain('future:card-1');
  });

  it('Dado sem parcelas futuras, então diz isso', async () => {
    const gateway = scenario();
    gateway.future$ = of({ total: brl('0.00'), byInvoice: [] });
    await setup(gateway, { url: '/cards/card-1?tab=future' });

    expect(await screen.findByTestId('future-empty')).toHaveTextContent(
      pt.cards.detail.futureEmpty,
    );
  });

  it('Dado o teclado, então as setas, Home e End trocam de aba e o foco acompanha', async () => {
    await setup();
    const invoices = screen.getByTestId('card-tabs-tab-invoices');
    const future = screen.getByTestId('card-tabs-tab-future');

    invoices.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(future).toHaveFocus();
    expect(future).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{Home}');
    expect(invoices).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(future).toHaveFocus();
  });

  it('Dado cartão de outro usuário ou inexistente (404), então "não encontrado" com voltar', async () => {
    const gateway = scenario();
    gateway.getResult = failWith(404, 'CARD_NOT_FOUND');
    await setup(gateway);

    expect(screen.getByTestId('empty-state-title')).toHaveTextContent(
      pt.cards.detail.notFound.title,
    );
    expect(screen.getByTestId('empty-state-action-back')).toHaveAttribute('href', '/cards');
  });

  it('Dado erro de rede, então "tentar de novo" recarrega o cartão', async () => {
    const gateway = scenario();
    gateway.getResult = failWith(0, 'NETWORK');
    await setup(gateway);
    expect(screen.getByTestId('error-state')).toBeInTheDocument();

    gateway.getResult = null;
    await userEvent.click(screen.getByTestId('empty-state-action-retry'));

    expect(await screen.findByTestId('card-header')).toBeInTheDocument();
  });

  it('Dado a carga, então mostra o esqueleto', async () => {
    const gateway = scenario();
    gateway.getResult = NEVER as never;
    await setup(gateway);

    expect(screen.getByTestId('card-loading')).toHaveTextContent(pt.cards.detail.loading);
  });

  describe('ações', () => {
    it('Dado 1280 px, então Pagar fatura, Nova compra e Editar são botões e links', async () => {
      await setup();

      expect(screen.getByTestId('card-pay')).toBeInTheDocument();
      expect(screen.getByTestId('card-new-purchase')).toHaveAttribute(
        'href',
        '/quick-add?mode=credit&cardId=card-1',
      );
      expect(screen.getByTestId('card-edit')).toHaveAttribute('href', '/cards/card-1/edit');
      expect(screen.queryByTestId('card-actions-menu')).not.toBeInTheDocument();
    });

    it('Dado 375 px, então as ações viram um menu e Editar leva ao formulário', async () => {
      const { router } = await setup(scenario(), { compact: true });

      expect(screen.queryByTestId('card-pay')).not.toBeInTheDocument();
      await userEvent.click(screen.getByTestId('card-actions-menu'));
      expect(screen.getByTestId('card-actions-menu-item-pay')).toBeInTheDocument();
      await userEvent.click(screen.getByTestId('card-actions-menu-item-edit'));

      expect(router.url).toBe('/cards/card-1/edit');
    });

    it('Dado o menu, então "Nova compra" leva ao /quick-add no modo crédito com o cartão', async () => {
      const { router } = await setup(scenario(), { compact: true });

      await userEvent.click(screen.getByTestId('card-actions-menu'));
      await userEvent.click(screen.getByTestId('card-actions-menu-item-purchase'));

      expect(router.url).toBe('/quick-add?mode=credit&cardId=card-1');
    });

    it('Dado fatura fechada com saldo, então "Pagar fatura" abre a folha com o outstanding dela e a conta padrão', async () => {
      await setup();

      await userEvent.click(screen.getByTestId('card-pay'));

      const sheet = await screen.findByTestId('pay-sheet-panel');
      expect(sheet).toHaveTextContent('Pagar a fatura de nov/2026');
      expect((screen.getByTestId('pay-amount') as HTMLInputElement).value).toBe('1.283,00');
      expect(screen.getByTestId('pay-account')).toHaveTextContent('Nubank');
    });

    it('Dado nenhuma fatura com saldo, então "Pagar fatura" fica desabilitado com a razão', async () => {
      const gateway = scenario();
      gateway.invoices = [];
      gateway.cards = [
        aCard({
          currentInvoice: anInvoiceSummary({ status: 'OPEN', outstanding: brl('0.00') }),
        }),
      ];
      await setup(gateway);

      const pay = screen.getByTestId('card-pay');
      expect(pay).toHaveAttribute('aria-disabled', 'true');
      expect(pay).toHaveAccessibleDescription(pt.cards.detail.nothingToPay);
      await userEvent.click(pay);
      expect(screen.queryByTestId('pay-sheet-panel')).not.toBeInTheDocument();
    });

    it('Dado a lista de faturas carregando, então "Pagar" fica desabilitado (não cai na corrente) com a dica de carregamento', async () => {
      const gateway = scenario();
      gateway.invoicesResult = NEVER as never;
      await setup(gateway);

      const pay = screen.getByTestId('card-pay');
      expect(pay).toHaveAttribute('aria-disabled', 'true');
      expect(pay).toHaveAccessibleDescription(pt.cards.detail.payInvoicesLoading);
      await userEvent.click(pay);
      expect(screen.queryByTestId('pay-sheet-panel')).not.toBeInTheDocument();
    });

    it('Dado a lista de faturas em erro, então "Pagar" fica desabilitado e o "tentar de novo" libera a fatura vencida', async () => {
      const gateway = scenario();
      gateway.invoicesResult = failWith(500, 'INTERNAL_ERROR');
      const { fixture } = await setup(gateway);

      const pay = screen.getByTestId('card-pay');
      expect(pay).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByTestId('card-pay-hint')).toHaveTextContent(
        pt.cards.detail.payInvoicesError,
      );
      await userEvent.click(pay);
      expect(screen.queryByTestId('pay-sheet-panel')).not.toBeInTheDocument();

      gateway.invoicesResult = null;
      await userEvent.click(screen.getByTestId('card-pay-hint-retry'));
      await fixture.whenStable();
      await userEvent.click(screen.getByTestId('card-pay'));

      expect(await screen.findByTestId('pay-sheet-panel')).toHaveTextContent(
        'Pagar a fatura de nov/2026',
      );
    });

    it('Dado a fatura corrente aberta com saldo e nada fechado, então o pagamento é antecipado nela', async () => {
      const gateway = scenario();
      gateway.invoices = [anInvoiceSummary({ id: 'inv-open', status: 'OPEN' })];
      await setup(gateway);

      await userEvent.click(screen.getByTestId('card-pay'));

      expect(await screen.findByTestId('pay-sheet-panel')).toBeInTheDocument();
      expect((screen.getByTestId('pay-amount') as HTMLInputElement).value).toBe('1.283,00');
    });

    it('Dado o pagamento feito, então a folha fecha e o cartão e as faturas são recarregados do backend', async () => {
      const gateway = scenario();
      const { fixture } = await setup(gateway);
      await userEvent.click(screen.getByTestId('card-pay'));
      await screen.findByTestId('pay-sheet-panel');
      gateway.pay$ = of(anInvoice({ id: 'inv-nov', status: 'PAID', outstanding: brl('0.00') }));
      const callsBefore = gateway.calls.filter((c) => c === 'get:card-1').length;

      await userEvent.click(screen.getByTestId('pay-submit'));
      await fixture.whenStable();

      expect(gateway.paymentCalls).toHaveLength(1);
      expect(screen.queryByTestId('pay-sheet-panel')).not.toBeInTheDocument();
      expect(gateway.calls.filter((c) => c === 'get:card-1').length).toBe(callsBefore + 1);
    });
  });

  it('Dado a tela, então o axe não aponta violações', async () => {
    const { container } = await setup();

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it('Dado cartão sem limite, então o cabeçalho diz "Limite não definido" e não desenha barra nem disponível', async () => {
    const gateway = scenario();
    gateway.cards = [aCard({ limit: null, availableLimit: null, usedRatio: null })];
    await setup(gateway);

    expect(text(screen.getByTestId('card-limit-value'))).toBe(pt.cards.limit.notSet);
    expect(screen.queryByTestId('card-available')).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('Dado fechamento não confirmado, então mostra selo, dica honesta e confirma com o cartão da resposta', async () => {
    const user = userEvent.setup();
    const gateway = scenario();
    gateway.cards = [aCard({ closingConfirmed: false, version: 4 })];
    await setup(gateway);

    expect(screen.getByTestId('closing-badge-card-1')).toHaveTextContent(pt.cards.closing.badge);
    expect(screen.getByTestId('card-closing-hint')).toHaveTextContent(pt.cards.closing.hint);

    await user.click(screen.getByTestId('card-closing-confirm'));
    expect(text(await screen.findByTestId('closing-modal-closing'))).toBe('Dia 25');

    await user.click(screen.getByTestId('closing-modal-confirm'));

    expect(gateway.closingCalls).toEqual([{ id: 'card-1', confirmed: true, version: 4 }]);
  });

  it('Dado fechamento confirmado, então não mostra selo nem ação de confirmar', async () => {
    await setup();

    expect(screen.queryByTestId('closing-badge-card-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('card-closing-confirm')).not.toBeInTheDocument();
  });
});
