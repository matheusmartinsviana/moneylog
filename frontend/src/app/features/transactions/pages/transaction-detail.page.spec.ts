import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { render, screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NEVER, of } from 'rxjs';

import { App } from '~/app/app';
import { pt } from '~/app/common/i18n/translations/pt';
import { ToastService } from '~/app/common/services/toast.service';
import { TransactionDetailPage } from '~/app/features/transactions/pages/transaction-detail.page';
import { TransactionsPage } from '~/app/features/transactions/pages/transactions.page';
import {
  AccountsGatewayStub,
  anAccount,
  brl,
  failWith,
  provideAccountsStub,
} from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { CategoriesGatewayStub, provideCategoriesStub } from '~/testing/categories-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { provideNotesStub } from '~/testing/notes-testing';
import {
  aTransaction,
  provideTransactionsStub,
  TransactionsGatewayStub,
} from '~/testing/transactions-testing';

// Fluxos longos com userEvent e axe: folga para máquinas ocupadas (CI, outros processos).
vi.setConfig({ testTimeout: 20_000 });

@Component({ selector: 'app-dummy', template: '' })
class DummyComponent {}

const text = (el: HTMLElement) =>
  el.textContent
    ?.replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

async function setup(gateway = new TransactionsGatewayStub(), url = '/transactions/tx-1') {
  const accounts = new AccountsGatewayStub();
  accounts.accounts = [anAccount()];
  const result = await render(App, {
    initialRoute: url,
    providers: [
      provideRouter(
        [
          { path: 'transactions/:id/edit', component: DummyComponent },
          {
            path: 'transactions',
            component: TransactionsPage,
            children: [{ path: ':id', component: TransactionDetailPage }],
          },
        ],
        withComponentInputBinding(),
      ),
      provideI18nTesting('pt'),
      provideNotesStub(),
      provideTransactionsStub(gateway),
      provideAccountsStub(accounts),
      provideCategoriesStub(new CategoriesGatewayStub()),
    ],
  });
  await result.fixture.whenStable();
  return {
    gateway,
    ...result,
    router: TestBed.inject(Router),
    toast: TestBed.inject(ToastService),
  };
}

describe('TransactionDetailPage', () => {
  it('Dado a tela, então mostra o bloco de notas vinculadas ao registro (a página injeta o bloco; nenhum módulo importa notes)', async () => {
    await setup();

    expect(await screen.findByTestId('detail-notes-block')).toHaveTextContent('Notas vinculadas');
    expect(screen.getByTestId('detail-notes-new')).toBeInTheDocument();
  });

  it('Dado uma despesa, então mostra os dados e o impacto exatamente como o backend calculou', async () => {
    const gateway = new TransactionsGatewayStub();
    gateway.get$ = of(
      aTransaction({
        // Valores que não "fecham" de propósito: o front exibe o recebido, sem recalcular.
        amount: brl('35.00'),
        impact: {
          cash: brl('-35.10'),
          consumption: [{ competence: '2026-10', amount: brl('36.00') }],
          netWorth: brl('-35.20'),
          commitment: brl('0.00'),
        },
      }),
    );
    await setup(gateway);

    expect(screen.getByRole('heading', { level: 1, name: 'Almoço' })).toBeInTheDocument();
    expect(text(screen.getByTestId('detail-amount'))).toBe('−R$ 35,00');
    expect(text(screen.getByTestId('detail-field-category'))).toContain('Alimentação');
    expect(text(screen.getByTestId('detail-field-account'))).toContain('Nubank');
    expect(text(screen.getByTestId('detail-field-method'))).toContain('Pix');
    expect(text(screen.getByTestId('impact-cash'))).toBe('No caixa−R$ 35,10');
    expect(text(screen.getByTestId('impact-consumption-2026-10'))).toBe(
      'No consumo de out/2026R$ 36,00',
    );
    expect(text(screen.getByTestId('impact-net-worth'))).toBe('No patrimônio−R$ 35,20');
  });

  it('Dado uma transferência, então rotula origem e destino', async () => {
    const gateway = new TransactionsGatewayStub();
    gateway.get$ = of(
      aTransaction({
        type: 'TRANSFER',
        category: null,
        method: null,
        account: { id: 'a', name: 'Nubank' },
        counterpartAccount: { id: 'b', name: 'Carteira' },
      }),
    );
    await setup(gateway);

    expect(text(screen.getByTestId('detail-field-account'))).toContain('Conta de origem');
    expect(text(screen.getByTestId('detail-field-counterpart'))).toContain('Conta de destino');
  });

  it('Dado um reembolso, então mostra o link para a despesa original', async () => {
    const gateway = new TransactionsGatewayStub();
    gateway.get$ = of(
      aTransaction({ type: 'REFUND', refundOf: { id: 'orig-1', description: 'Jantar' } }),
    );
    await setup(gateway);

    expect(screen.getByTestId('detail-refund-link')).toHaveAttribute(
      'href',
      '/transactions/orig-1',
    );
  });

  describe('editar', () => {
    it('Dado editable true, então mostra "Editar" para /transactions/:id/edit', async () => {
      await setup();

      expect(screen.getByTestId('detail-edit')).toHaveAttribute('href', '/transactions/tx-1/edit');
    });

    it('Dado editable false, então a ação Editar não aparece', async () => {
      const gateway = new TransactionsGatewayStub();
      gateway.get$ = of(aTransaction({ editable: false }));
      await setup(gateway);

      expect(screen.queryByTestId('detail-edit')).not.toBeInTheDocument();
    });
  });

  describe('estornar', () => {
    it('Dado voidable true, quando estorno com motivo, então mostra "estornada" com voidedAt e voidReason da resposta', async () => {
      const gateway = new TransactionsGatewayStub();
      gateway.void$ = of(
        aTransaction({
          status: 'VOIDED',
          voidable: false,
          editable: false,
          voidedAt: '2026-10-04T15:30:00Z',
          voidReason: 'lancei em duplicidade',
        }),
      );
      const { toast } = await setup(gateway);

      await userEvent.click(screen.getByTestId('void-open'));
      const dialog = screen.getByTestId('confirm-dialog');
      expect(screen.getByTestId('confirm-dialog-confirm')).toBeDisabled();
      await userEvent.type(
        within(dialog).getByTestId('confirm-dialog-reason'),
        'lancei em duplicidade',
      );
      await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));

      expect(gateway.voids).toEqual([{ id: 'tx-1', reason: 'lancei em duplicidade' }]);
      expect(screen.getByTestId('detail-voided')).toHaveTextContent('Estornada');
      expect(screen.getByTestId('detail-voided-at')).toHaveTextContent(
        'Estornada em 4 de outubro de 2026',
      );
      expect(screen.getByTestId('detail-void-reason')).toHaveTextContent('lancei em duplicidade');
      expect(screen.queryByTestId('void-open')).not.toBeInTheDocument();
      expect(screen.queryByTestId('detail-edit')).not.toBeInTheDocument();
      expect(screen.queryByTestId('impact-panel')).not.toBeInTheDocument();
      expect(toast.toasts()[0]?.message).toBe(pt.transactions.detail.void.toast);
    });

    it.each([
      ['ACCOUNT_ARCHIVED', 'Desarquive a conta para corrigir este registro.'],
      ['HAS_ACTIVE_REFUNDS', 'Estorne antes os reembolsos desta despesa.'],
    ] as const)(
      'Dado voidable false por %s, então a ação fica desabilitada com o texto do motivo',
      async (blockedBy, message) => {
        const gateway = new TransactionsGatewayStub();
        gateway.get$ = of(aTransaction({ voidable: false, voidBlockedBy: blockedBy }));
        await setup(gateway);

        const button = screen.getByTestId('void-open');
        expect(button).toHaveAttribute('aria-disabled', 'true');
        expect(button).toHaveAccessibleDescription(message);
        await userEvent.click(button);
        expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
      },
    );

    it.each([
      ['ACCOUNT_ARCHIVED', 'Desarquive a conta para corrigir este registro.'],
      ['TRANSACTION_HAS_ACTIVE_REFUNDS', 'Estorne antes os reembolsos desta despesa.'],
    ])(
      'Dado o 422 %s no estorno, então mostra o mesmo texto do bloqueio',
      async (code, message) => {
        const gateway = new TransactionsGatewayStub();
        gateway.void$ = failWith(422, code);
        await setup(gateway);

        await userEvent.click(screen.getByTestId('void-open'));
        await userEvent.type(screen.getByTestId('confirm-dialog-reason'), 'erro');
        await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));

        expect(screen.getByTestId('void-error')).toHaveTextContent(message);
        expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
      },
    );

    it('Dado voidable false sem motivo (já estornada), então não há ação nem texto de bloqueio', async () => {
      const gateway = new TransactionsGatewayStub();
      gateway.get$ = of(aTransaction({ status: 'VOIDED', voidable: false }));
      await setup(gateway);

      expect(screen.queryByTestId('void-open')).not.toBeInTheDocument();
      expect(screen.queryByTestId('void-blocked')).not.toBeInTheDocument();
    });
  });

  describe('estados', () => {
    it('Dado um id inexistente, então mostra "não encontrada" com link para a lista', async () => {
      const gateway = new TransactionsGatewayStub();
      gateway.get$ = failWith(404, 'TRANSACTION_NOT_FOUND');
      await setup(gateway);

      expect(screen.getByText(pt.transactions.detail.notFound.title)).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: pt.transactions.detail.notFound.back }),
      ).toHaveAttribute('href', '/transactions');
    });

    it('Dado carregando, então avisa por role status', async () => {
      const gateway = new TransactionsGatewayStub();
      gateway.get$ = NEVER;
      await setup(gateway);

      expect(screen.getByText(pt.transactions.detail.loading)).toHaveAttribute('role', 'status');
    });

    it('Dado erro ao carregar, então mostra o erro e "tentar de novo" recarrega', async () => {
      const gateway = new TransactionsGatewayStub();
      gateway.get$ = failWith(500, 'INTERNAL_ERROR');
      await setup(gateway);
      expect(screen.getByTestId('error-state')).toBeInTheDocument();

      gateway.get$ = of(aTransaction());
      await userEvent.click(screen.getByRole('button', { name: pt.errors.load.retry }));

      expect(await screen.findByTestId('detail-amount')).toBeInTheDocument();
    });
  });

  describe('fechar', () => {
    it('Dado o detalhe aberto sobre a lista, quando aperto Esc, então fecha e o foco volta à linha', async () => {
      const gateway = new TransactionsGatewayStub();
      const { router, fixture } = await setup(gateway);
      expect(document.activeElement).toBe(screen.getByTestId('detail-title'));

      await userEvent.keyboard('{Escape}');
      await fixture.whenStable();

      expect(router.url).toBe('/transactions');
      expect(screen.queryByTestId('transaction-detail')).not.toBeInTheDocument();
      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByTestId('transaction-row-tx-1')),
      );
    });

    it('Dado o botão fechar, então fecha o painel mantendo os filtros da URL', async () => {
      const { router, fixture } = await setup(undefined, '/transactions/tx-1?type=EXPENSE');

      await userEvent.click(screen.getByTestId('detail-close'));
      await fixture.whenStable();

      expect(router.url).toBe('/transactions?type=EXPENSE');
    });

    it('Dado o celular (tela cheia), quando uso "Voltar", então volta à lista mantendo os filtros', async () => {
      const { router, fixture } = await setup(undefined, '/transactions/tx-1?type=EXPENSE');

      await userEvent.click(screen.getByTestId('detail-back'));
      await fixture.whenStable();

      expect(router.url).toBe('/transactions?type=EXPENSE');
    });

    it('Dado o diálogo de estorno aberto, quando aperto Esc, então fecha só o diálogo', async () => {
      const { router } = await setup();
      await userEvent.click(screen.getByTestId('void-open'));

      await userEvent.keyboard('{Escape}');

      expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
      expect(router.url).toBe('/transactions/tx-1');
    });
  });

  it('Dado o detalhe aberto, então o axe não aponta violações', async () => {
    const { container } = await setup();

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
