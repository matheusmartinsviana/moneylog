import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { render, screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';

import { App } from '~/app/app';
import { pt } from '~/app/common/i18n/translations/pt';
import { TransactionDetailPage } from '~/app/features/transactions/pages/transaction-detail.page';
import { TransactionsPage } from '~/app/features/transactions/pages/transactions.page';
import {
  AccountsGatewayStub,
  anAccount,
  brl,
  provideAccountsStub,
} from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import {
  aCategory,
  CategoriesGatewayStub,
  provideCategoriesStub,
} from '~/testing/categories-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { provideNotesStub } from '~/testing/notes-testing';
import { aDebtSummary } from '~/testing/people-testing';
import { provideThirdPartiesStub } from '~/testing/third-parties-testing';
import {
  aTransaction,
  provideTransactionsStub,
  TransactionsGatewayStub,
} from '~/testing/transactions-testing';

vi.setConfig({ testTimeout: 20_000 });

@Component({ selector: 'app-dummy', template: '' })
class DummyComponent {}

const text = (el: HTMLElement) =>
  el.textContent
    ?.replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

async function setup(gateway: TransactionsGatewayStub, url: string) {
  const accounts = new AccountsGatewayStub();
  accounts.accounts = [anAccount()];
  const categories = new CategoriesGatewayStub();
  categories.categories = [aCategory({ id: 'cat-1', name: 'Alimentação' })];
  const result = await render(App, {
    initialRoute: url,
    providers: [
      provideRouter(
        [
          { path: 'debts/:id', component: DummyComponent },
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
      provideThirdPartiesStub(),
      provideTransactionsStub(gateway),
      provideAccountsStub(accounts),
      provideCategoriesStub(categories),
    ],
  });
  await result.fixture.whenStable();
  return { ...result, router: TestBed.inject(Router) };
}

describe('Movimentações de dívida (Etapa 4)', () => {
  describe('detalhe', () => {
    it('Dado um empréstimo de 300,00, então mostra a dívida (link) e o impacto do backend: caixa −300,00, sem consumo, patrimônio 0,00', async () => {
      const gateway = new TransactionsGatewayStub();
      gateway.get$ = of(
        aTransaction({
          type: 'LOAN_GIVEN',
          description: 'Empréstimo para João',
          amount: brl('300.00'),
          category: null,
          method: null,
          debt: aDebtSummary({ id: 'debt-9', description: 'Empréstimo para João' }),
          impact: {
            cash: brl('-300.00'),
            consumption: [],
            netWorth: brl('0.00'),
            commitment: brl('0.00'),
          },
        }),
      );
      await setup(gateway, '/transactions/tx-1');

      expect(text(screen.getByTestId('detail-field-type'))).toContain('Empréstimo concedido');
      expect(text(screen.getByTestId('detail-field-debt'))).toContain(
        'João · Empréstimo para João',
      );
      expect(screen.getByTestId('detail-debt-link')).toHaveAttribute('href', '/debts/debt-9');
      expect(text(screen.getByTestId('impact-cash'))).toBe('No caixa−R$ 300,00');
      expect(text(screen.getByTestId('impact-net-worth'))).toBe('No patrimônioR$ 0,00');
      expect(document.querySelector('[data-cy^="impact-consumption-"]')).toBeNull();
    });

    it('Dado despesa dividida (200,00 com João 100,00), então lista as partes e o consumo de 100,00 como o backend devolveu', async () => {
      const gateway = new TransactionsGatewayStub();
      gateway.get$ = of(
        aTransaction({
          amount: brl('200.00'),
          description: 'Jantar',
          shares: [
            aDebtSummary({ id: 'debt-s1', principal: brl('100.00'), outstanding: brl('100.00') }),
          ],
          impact: {
            cash: brl('-200.00'),
            consumption: [{ competence: '2026-10', amount: brl('100.00') }],
            netWorth: brl('-100.00'),
            commitment: brl('0.00'),
          },
        }),
      );
      await setup(gateway, '/transactions/tx-1');

      expect(text(screen.getByTestId('detail-field-share-debt-s1'))).toContain('Parte de João');
      expect(text(screen.getByTestId('detail-field-share-debt-s1'))).toContain('R$ 100,00');
      expect(screen.getByTestId('detail-share-link-debt-s1')).toHaveAttribute(
        'href',
        '/debts/debt-s1',
      );
      expect(text(screen.getByTestId('impact-cash'))).toBe('No caixa−R$ 200,00');
      expect(text(screen.getByTestId('impact-consumption-2026-10'))).toBe(
        'No consumo de out/2026R$ 100,00',
      );
    });

    it('Dado a origem de uma dívida com quitação ativa, então o estorno fica desabilitado com a explicação (DEBT_HAS_SETTLEMENTS)', async () => {
      const gateway = new TransactionsGatewayStub();
      gateway.get$ = of(
        aTransaction({
          type: 'LOAN_GIVEN',
          category: null,
          method: null,
          debt: aDebtSummary(),
          voidable: false,
          voidBlockedBy: 'DEBT_HAS_SETTLEMENTS',
        }),
      );
      await setup(gateway, '/transactions/tx-1');

      expect(screen.getByTestId('void-blocked')).toHaveTextContent(
        pt.transactions.detail.void.blocked.DEBT_HAS_SETTLEMENTS,
      );
      expect(screen.getByTestId('void-open')).toHaveAttribute('aria-disabled', 'true');
    });

    it('Dado a movimentação criada ao realizar uma recorrência, então mostra a origem com a data da ocorrência', async () => {
      const gateway = new TransactionsGatewayStub();
      gateway.get$ = of(
        aTransaction({
          source: 'RECURRENCE',
          recurrenceId: 'rec-1',
          occurrenceDate: '2026-10-10',
          description: 'Internet',
        }),
      );
      await setup(gateway, '/transactions/tx-1');

      expect(text(screen.getByTestId('detail-field-recurrence'))).toContain(
        'Ocorrência de 10 de out.',
      );
      expect(screen.getByTestId('detail-recurrence-link')).toHaveAttribute(
        'href',
        '/planning/recurrences',
      );
    });

    it('Dado o detalhe de uma dívida, então o axe não aponta violações', async () => {
      const gateway = new TransactionsGatewayStub();
      gateway.get$ = of(
        aTransaction({ type: 'LOAN_GIVEN', category: null, method: null, debt: aDebtSummary() }),
      );
      const { container } = await setup(gateway, '/transactions/tx-1');

      const violations = await axeViolations(container);
      expect(violations, describeViolations(violations)).toEqual([]);
    }, 60_000);
  });

  describe('visão por competência', () => {
    const gateway = () => {
      const stub = new TransactionsGatewayStub();
      stub.entries$ = () =>
        of({
          items: [],
          hasNext: false,
          debtItems: [
            {
              debtId: 'debt-5',
              date: '2026-10-05',
              competence: '2026-10',
              description: 'Jantar que a Maria pagou',
              category: { id: 'cat-1', name: 'Alimentação' },
              amount: brl('80.00'),
            },
          ],
          totals: { total: brl('80.00'), byCategory: [] },
        });
      return stub;
    };

    it('Dado consumo de dívida sem movimentação, então aparece como linha (mesmo sem nenhum lançamento), com o total do backend', async () => {
      await setup(gateway(), '/transactions?view=entries');

      const row = screen.getByTestId('debt-entry-row-0');
      expect(text(row)).toContain('Jantar que a Maria pagou');
      expect(text(row)).toContain('Dívida');
      expect(text(row)).toContain('R$ 80,00');
      expect(text(screen.getByTestId('totals-footer-total'))).toBe('R$ 80,00');
      expect(screen.queryByTestId('empty-state-title')).not.toBeInTheDocument();
    });

    it('Dado a linha da dívida, quando abro, então vai à dívida (ela não tem movimentação)', async () => {
      const { router } = await setup(gateway(), '/transactions?view=entries');

      await userEvent.click(screen.getByTestId('debt-entry-row-0'));

      await waitFor(() => expect(router.url).toBe('/debts/debt-5'));
    });
  });
});
