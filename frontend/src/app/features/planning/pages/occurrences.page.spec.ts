import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { render, screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NEVER, of, Subject } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { ToastService } from '~/app/common/services/toast.service';
import { OccurrencesPage } from '~/app/features/planning/pages/occurrences.page';
import {
  AccountsGatewayStub,
  anAccount,
  brl,
  failWith,
  provideAccountsStub,
} from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';
import {
  aRealized,
  anOccurrence,
  provideRecurrencesStub,
  RecurrencesGatewayStub,
} from '~/testing/recurrences-testing';

vi.setConfig({ testTimeout: 20_000 });

@Component({ selector: 'app-dummy', template: '' })
class DummyComponent {}

const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, ' ').trim();
const pick = async (id: string, value: string) => {
  await userEvent.click(screen.getByTestId(id));
  await userEvent.click(screen.getByTestId(`${id}-option-${value}`));
};
const field = (id: string) => screen.getByTestId(id) as HTMLInputElement;

async function setup(gateway = new RecurrencesGatewayStub()) {
  const accounts = new AccountsGatewayStub();
  accounts.accounts = [anAccount({ id: 'acc-1', name: 'Conta corrente' })];
  const result = await render(OccurrencesPage, {
    providers: [
      provideAccountsStub(accounts),
      provideI18nTesting('pt'),
      provideRouter([{ path: 'cards/:id/invoices/:invoiceId', component: DummyComponent }]),
      provideRecurrencesStub(gateway),
    ],
  });
  await result.fixture.whenStable();
  return {
    ...result,
    gateway,
    toast: TestBed.inject(ToastService),
    router: TestBed.inject(Router),
  };
}

const scenario = () => {
  const gateway = new RecurrencesGatewayStub();
  gateway.occurrences = [
    anOccurrence({ recurrenceId: 'rec-1', date: '2026-09-10', overdue: true }),
    anOccurrence({ recurrenceId: 'rec-1', date: '2026-10-10' }),
    anOccurrence({
      recurrenceId: 'rec-2',
      date: '2026-10-15',
      description: 'Streaming',
      accountId: null,
      cardId: 'card-1',
      amount: brl('50.00'),
    }),
  ];
  return gateway;
};

describe('OccurrencesPage', () => {
  it('Dado ocorrências, então mostra data, descrição, valor previsto e se é conta ou cartão', async () => {
    await setup(scenario());

    expect(text(screen.getByTestId('occurrence-title-rec-1-2026-10-10'))).toBe('Internet');
    expect(text(screen.getByTestId('occurrence-date-rec-1-2026-10-10'))).toBe('10 de out.');
    expect(text(screen.getByTestId('occurrence-amount-rec-1-2026-10-10'))).toBe('R$ 119,00');
    expect(text(screen.getByTestId('occurrence-via-rec-1-2026-10-10'))).toBe('Em conta');
    expect(text(screen.getByTestId('occurrence-via-rec-2-2026-10-15'))).toBe('No cartão');
  });

  it('Dado vencidas, então aparecem em "Atrasadas" com texto (e cor), pelo overdue do backend', async () => {
    await setup(scenario());

    const overdue = screen.getByTestId('occurrences-overdue');
    expect(within(overdue).getByTestId('occurrence-row-rec-1-2026-09-10')).toBeInTheDocument();
    expect(screen.getByTestId('occurrence-overdue-rec-1-2026-09-10')).toHaveTextContent(
      pt.recurrences.occurrences.overdue,
    );
    const upcoming = screen.getByTestId('occurrences-upcoming');
    expect(within(upcoming).getByTestId('occurrence-row-rec-1-2026-10-10')).toBeInTheDocument();
    expect(within(upcoming).queryByTestId('occurrence-row-rec-1-2026-09-10')).toBeNull();
  });

  it('Dado a carga, então pede só as pendentes, sem `from` (as vencidas vêm)', async () => {
    const gateway = scenario();
    await setup(gateway);

    expect(gateway.occurrenceQueries[0]).toMatchObject({ status: 'PENDING' });
    expect(gateway.occurrenceQueries[0]?.from).toBeUndefined();
  });

  it('Dado overdueTruncated, então avisa "500 mais recentes" e sem o campo não avisa', async () => {
    const gateway = scenario();
    gateway.overdueTruncated = true;
    await setup(gateway);

    expect(screen.getByTestId('occurrences-truncated')).toHaveTextContent(
      pt.recurrences.occurrences.overdueTruncated,
    );
  });

  it('Dado overdueTruncated falso, então não há aviso', async () => {
    await setup(scenario());

    expect(screen.queryByTestId('occurrences-truncated')).not.toBeInTheDocument();
  });

  it('Dado nada pendente, então o estado vazio explica', async () => {
    await setup();

    expect(screen.getByTestId('empty-state-title')).toHaveTextContent(
      pt.recurrences.occurrences.emptyTitle,
    );
  });

  it('Dado a carga, então mostra o esqueleto com texto para leitor de tela', async () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.occurrencesResult = NEVER as never;
    await setup(gateway);

    expect(screen.getByTestId('occurrences-loading')).toHaveTextContent(
      pt.recurrences.occurrences.loading,
    );
  });

  it('Dado erro de rede, então mostra o erro com "tentar de novo" e recarrega', async () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.occurrencesResult = failWith(0, 'NETWORK');
    await setup(gateway);
    expect(screen.getByTestId('error-state')).toBeInTheDocument();

    gateway.occurrencesResult = null;
    gateway.occurrences = [anOccurrence()];
    await userEvent.click(screen.getByTestId('empty-state-action-retry'));

    expect(await screen.findByTestId('occurrence-row-rec-1-2026-10-10')).toBeInTheDocument();
  });

  describe('Realizar', () => {
    it('Dado "Realizar", então a folha pré-preenche o valor do modelo (editável) e mostra a data da ocorrência', async () => {
      await setup(scenario());

      await userEvent.click(screen.getByTestId('occurrence-realize-rec-1-2026-10-10'));

      expect(screen.getByTestId('realize-sheet-panel')).toHaveTextContent('Realizar Internet');
      expect(field('realize-amount').value).toBe('119,00');
      expect(screen.getByTestId('realize-date')).toHaveTextContent('10 de outubro de 2026');
      expect(screen.queryByTestId('realize-card-note')).not.toBeInTheDocument();
    });

    it('Dado valor real 124,90, quando realizo, então envia o valor e uma Idempotency-Key, e a ocorrência some depois de recarregar', async () => {
      const gateway = scenario();
      const { toast, fixture } = await setup(gateway);

      await userEvent.click(screen.getByTestId('occurrence-realize-rec-1-2026-10-10'));
      await userEvent.clear(field('realize-amount'));
      await userEvent.type(field('realize-amount'), '124,90');
      gateway.occurrences = gateway.occurrences.filter((o) => o.date !== '2026-10-10');
      await userEvent.click(screen.getByTestId('realize-submit'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(gateway.realizations).toHaveLength(1);
      expect(gateway.realizations[0]).toMatchObject({
        recurrenceId: 'rec-1',
        date: '2026-10-10',
        amount: '124.90',
      });
      expect(gateway.realizations[0]?.key).toBeTruthy();
      expect(toast.toasts()[0]?.message).toBe(pt.recurrences.realize.toast);
      expect(screen.queryByTestId('occurrence-row-rec-1-2026-10-10')).not.toBeInTheDocument();
      expect(screen.queryByTestId('realize-sheet-panel')).not.toBeInTheDocument();
    });

    it('Dado recorrência sem conta, então a folha pede conta e meio e só envia com os dois', async () => {
      const gateway = scenario();
      gateway.occurrences = [
        anOccurrence({
          recurrenceId: 'rec-3',
          date: '2026-10-20',
          description: 'Aluguel',
          accountId: null,
          cardId: null,
        }),
      ];
      const { fixture } = await setup(gateway);

      expect(screen.getByTestId('occurrence-account-tbd-rec-3-2026-10-20')).toHaveTextContent(
        pt.recurrences.occurrences.accountTbd,
      );
      await userEvent.click(screen.getByTestId('occurrence-realize-rec-3-2026-10-20'));
      expect(screen.getByTestId('realize-account-note')).toBeInTheDocument();
      await userEvent.click(screen.getByTestId('realize-submit'));
      await fixture.whenStable();
      expect(gateway.realizations).toHaveLength(0);

      await pick('realize-account', 'acc-1');
      await pick('realize-method', 'PIX');
      await userEvent.click(screen.getByTestId('realize-submit'));
      await fixture.whenStable();

      expect(gateway.realizations[0]?.payment).toEqual({ accountId: 'acc-1', method: 'PIX' });
    });

    it('Dado RECURRENCE_ACCOUNT_REQUIRED do servidor (tela sem saber), então a folha passa a pedir a conta no campo', async () => {
      const gateway = scenario();
      gateway.realize$ = failWith(422, 'RECURRENCE_ACCOUNT_REQUIRED');
      const { fixture } = await setup(gateway);

      await userEvent.click(screen.getByTestId('occurrence-realize-rec-1-2026-10-10'));
      expect(screen.queryByTestId('realize-account-note')).not.toBeInTheDocument();
      await userEvent.click(screen.getByTestId('realize-submit'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(screen.getByTestId('realize-account-note')).toBeInTheDocument();
      expect(screen.queryByTestId('realize-error')).not.toBeInTheDocument();
    });

    it('Dado o valor do modelo sem mudar, então vai sem valor (o backend usa o do modelo)', async () => {
      const gateway = scenario();
      const { fixture } = await setup(gateway);

      await userEvent.click(screen.getByTestId('occurrence-realize-rec-1-2026-10-10'));
      await userEvent.click(screen.getByTestId('realize-submit'));
      await fixture.whenStable();

      expect(gateway.realizations[0]?.amount).toBeNull();
    });

    it('Dado uma ocorrência de cartão, então avisa que a fatura é escolhida pelo servidor e o aviso leva à fatura devolvida', async () => {
      const gateway = scenario();
      gateway.realize$ = of(
        aRealized({
          card: { id: 'card-1', name: 'Roxinho' },
          invoice: { id: 'inv-9', referenceMonth: '2026-11', dueDate: '2026-11-05' },
        }),
      );
      const { toast, router, fixture } = await setup(gateway);

      await userEvent.click(screen.getByTestId('occurrence-realize-rec-2-2026-10-15'));
      expect(screen.getByTestId('realize-card-note')).toHaveTextContent(
        pt.recurrences.realize.cardNote,
      );
      await userEvent.click(screen.getByTestId('realize-submit'));
      await fixture.whenStable();

      const view = toast.toasts()[0]?.actions?.find((action) => action.id === 'invoice');
      expect(view?.label).toBe(pt.recurrences.realize.viewInvoice);
      view?.run();
      await waitFor(() => expect(router.url).toBe('/cards/card-1/invoices/inv-9'));
    });

    it('Dado RECURRENCE_OCCURRENCE_ALREADY_REALIZED, então a mensagem é clara e a lista recarrega', async () => {
      const gateway = scenario();
      const { fixture } = await setup(gateway);
      await userEvent.click(screen.getByTestId('occurrence-realize-rec-1-2026-10-10'));
      gateway.realize$ = failWith(422, 'RECURRENCE_OCCURRENCE_ALREADY_REALIZED');
      gateway.occurrences = gateway.occurrences.filter((o) => o.date !== '2026-10-10');
      const before = gateway.occurrenceQueries.length;

      await userEvent.click(screen.getByTestId('realize-submit'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(screen.getByTestId('realize-error')).toHaveTextContent(
        pt.errors.codes['RECURRENCE_OCCURRENCE_ALREADY_REALIZED']!,
      );
      expect(gateway.occurrenceQueries.length).toBeGreaterThan(before);
      expect(screen.queryByTestId('occurrence-row-rec-1-2026-10-10')).not.toBeInTheDocument();
    });

    it.each(['RECURRENCE_INACTIVE', 'RECURRENCE_ENDED'])(
      'Dado %s ao realizar, então a mensagem é traduzida e a lista recarrega',
      async (code) => {
        const gateway = scenario();
        const { fixture } = await setup(gateway);
        await userEvent.click(screen.getByTestId('occurrence-realize-rec-1-2026-10-10'));
        gateway.realize$ = failWith(422, code);
        gateway.occurrences = gateway.occurrences.filter((o) => o.date !== '2026-10-10');
        const before = gateway.occurrenceQueries.length;

        await userEvent.click(screen.getByTestId('realize-submit'));
        await fixture.whenStable();
        fixture.detectChanges();

        expect(screen.getByTestId('realize-error')).toHaveTextContent(pt.errors.codes[code]!);
        expect(gateway.occurrenceQueries.length).toBeGreaterThan(before);
        expect(screen.queryByTestId('occurrence-row-rec-1-2026-10-10')).not.toBeInTheDocument();
      },
    );

    it('Dado o clique duplo, então uma requisição só', async () => {
      const gateway = scenario();
      gateway.realize$ = new Subject<ReturnType<typeof aRealized>>();
      await setup(gateway);

      await userEvent.click(screen.getByTestId('occurrence-realize-rec-1-2026-10-10'));
      await userEvent.dblClick(screen.getByTestId('realize-submit'));

      expect(gateway.realizations).toHaveLength(1);
    });

    it.each([
      ['rede', 0, 'NETWORK'],
      ['5xx', 503, 'INTERNAL_ERROR'],
      ['409 CONFLICT', 409, 'CONFLICT'],
    ])(
      'Dado falha ambígua (%s), então "tentar de novo" reenvia com a MESMA Idempotency-Key',
      async (_, status, code) => {
        const gateway = scenario();
        gateway.realize$ = failWith(status, code);
        await setup(gateway);
        await userEvent.click(screen.getByTestId('occurrence-realize-rec-1-2026-10-10'));

        await userEvent.click(screen.getByTestId('realize-submit'));
        gateway.realize$ = null;
        await userEvent.click(screen.getByTestId('realize-retry'));

        expect(gateway.realizations).toHaveLength(2);
        expect(gateway.realizations[1]?.key).toBe(gateway.realizations[0]?.key);
      },
    );

    it('Dado resposta perdida, quando fecho e reabro a folha e envio de novo, então é a mesma Idempotency-Key', async () => {
      const gateway = scenario();
      gateway.realize$ = failWith(0, 'NETWORK');
      await setup(gateway);
      await userEvent.click(screen.getByTestId('occurrence-realize-rec-1-2026-10-10'));
      await userEvent.click(screen.getByTestId('realize-submit'));

      await userEvent.click(screen.getByTestId('realize-cancel'));
      await userEvent.click(screen.getByTestId('occurrence-realize-rec-1-2026-10-10'));
      expect(screen.getByTestId('realize-retry')).toBeInTheDocument();
      await userEvent.click(screen.getByTestId('realize-submit'));

      expect(gateway.realizations).toHaveLength(2);
      expect(gateway.realizations[1]?.key).toBe(gateway.realizations[0]?.key);
    });

    it('Dado Esc, então fecha sem enviar nada', async () => {
      const gateway = scenario();
      await setup(gateway);
      await userEvent.click(screen.getByTestId('occurrence-realize-rec-1-2026-10-10'));

      await userEvent.keyboard('{Escape}');

      expect(screen.queryByTestId('realize-sheet-panel')).not.toBeInTheDocument();
      expect(gateway.realizations).toHaveLength(0);
    });

    it('Dado a folha aberta, então é um diálogo nomeado, com o foco dentro, e o axe não aponta violações', async () => {
      await setup(scenario());
      await userEvent.click(screen.getByTestId('occurrence-realize-rec-1-2026-10-10'));

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAccessibleName('Realizar Internet');
      expect(dialog.contains(document.activeElement)).toBe(true);
      const violations = await axeViolations(document.body);
      expect(violations, describeViolations(violations)).toEqual([]);
    });
  });

  describe('Pular', () => {
    it('Dado "Pular", então confirma, não cria movimentação e a ocorrência some', async () => {
      const gateway = scenario();
      const { toast, fixture } = await setup(gateway);

      await userEvent.click(screen.getByTestId('occurrence-skip-rec-1-2026-10-10'));
      expect(screen.getByRole('dialog')).toHaveTextContent(
        pt.recurrences.occurrences.skipConfirm.description,
      );
      await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(gateway.calls).toContain('skip:rec-1:2026-10-10');
      expect(gateway.realizations).toHaveLength(0);
      expect(screen.queryByTestId('occurrence-row-rec-1-2026-10-10')).not.toBeInTheDocument();
      expect(toast.toasts()[0]?.message).toBe(pt.recurrences.occurrences.toastSkipped);
    });

    it('Dado cancelar a confirmação, então nada é enviado', async () => {
      const gateway = scenario();
      await setup(gateway);

      await userEvent.click(screen.getByTestId('occurrence-skip-rec-1-2026-10-10'));
      await userEvent.keyboard('{Escape}');

      expect(gateway.calls.filter((call) => call.startsWith('skip'))).toHaveLength(0);
    });

    it('Dado RECURRENCE_OCCURRENCE_ALREADY_REALIZED ao pular, então a mensagem aparece e a lista recarrega', async () => {
      const gateway = scenario();
      const { fixture } = await setup(gateway);
      gateway.skip$ = failWith(422, 'RECURRENCE_OCCURRENCE_ALREADY_REALIZED');
      gateway.occurrences = gateway.occurrences.filter((o) => o.date !== '2026-10-10');

      await userEvent.click(screen.getByTestId('occurrence-skip-rec-1-2026-10-10'));
      await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(screen.getByTestId('occurrences-error')).toHaveTextContent(
        pt.errors.codes['RECURRENCE_OCCURRENCE_ALREADY_REALIZED']!,
      );
      expect(screen.queryByTestId('occurrence-row-rec-1-2026-10-10')).not.toBeInTheDocument();
    });
  });

  it('Dado teclado, então "Realizar" e "Pular" são botões com nome acessível da ocorrência', async () => {
    await setup(scenario());

    expect(screen.getByTestId('occurrence-realize-rec-1-2026-10-10')).toHaveAccessibleName(
      'Realizar Internet',
    );
    expect(screen.getByTestId('occurrence-skip-rec-1-2026-10-10')).toHaveAccessibleName(
      'Pular Internet',
    );
  });

  it('Dado a lista, então o axe não aponta violações', async () => {
    const { container } = await setup(scenario());

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
