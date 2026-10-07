import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NEVER } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { DebtPage } from '~/app/features/debts/pages/debt.page';
import {
  AccountsGatewayStub,
  anAccount,
  brl,
  failWith,
  provideAccountsStub,
} from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { aDebt, DebtsGatewayStub, provideDebtsStub } from '~/testing/debts-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { provideNotesStub } from '~/testing/notes-testing';
import {
  aTransaction,
  provideTransactionsStub,
  TransactionsGatewayStub,
} from '~/testing/transactions-testing';

vi.setConfig({ testTimeout: 20_000 });

const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, ' ').trim();

async function setup(debts = new DebtsGatewayStub(), transactions = new TransactionsGatewayStub()) {
  const accounts = new AccountsGatewayStub();
  accounts.accounts = [anAccount({ id: 'acc-1', name: 'Nubank' })];
  const result = await render(DebtPage, {
    inputs: { id: 'debt-1' },
    providers: [
      provideI18nTesting('pt'),
      provideNotesStub(),
      provideRouter([]),
      provideDebtsStub(debts),
      provideTransactionsStub(transactions),
      provideAccountsStub(accounts),
    ],
  });
  await result.fixture.whenStable();
  return { ...result, debts, transactions };
}

describe('DebtPage', () => {
  it('Dado a tela, então mostra o bloco de notas vinculadas ao registro (a página injeta o bloco; nenhum módulo importa notes)', async () => {
    await setup();

    expect(await screen.findByTestId('debt-notes-block')).toHaveTextContent('Notas vinculadas');
    expect(screen.getByTestId('debt-notes-new')).toBeInTheDocument();
  });

  it('Dado a dívida de 300,00 com 100,00 pagos, então mostra os três valores do backend, o status em texto e a pessoa', async () => {
    const debts = new DebtsGatewayStub();
    debts.debts = [aDebt()];
    await setup(debts);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Empréstimo');
    expect(text(screen.getByTestId('debt-principal'))).toBe('R$ 300,00');
    expect(text(screen.getByTestId('debt-settled'))).toBe('R$ 100,00');
    expect(text(screen.getByTestId('debt-outstanding'))).toBe('R$ 200,00');
    expect(text(screen.getByTestId('debt-status'))).toBe('Parcialmente quitada');
    expect(screen.getByTestId('debt-person-link')).toHaveAttribute('href', '/people/person-1');
    expect(screen.getByTestId('debt-origin-link')).toHaveAttribute('href', '/transactions/tx-loan');
  });

  it('Dado as quitações, então lista cada uma e estorna só as ativas', async () => {
    const debts = new DebtsGatewayStub();
    debts.debts = [
      aDebt({
        settlements: [
          { transactionId: 't1', amount: brl('100.00'), date: '2026-10-06', active: true },
          { transactionId: 't2', amount: brl('50.00'), date: '2026-10-07', active: false },
        ],
      }),
    ];
    await setup(debts);

    expect(screen.getByTestId('debt-settlement-reverse-t1')).toBeInTheDocument();
    expect(screen.queryByTestId('debt-settlement-reverse-t2')).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('debt-settlement-t2')).getByText(
        pt.debts.detail.settlements.reversed,
      ),
    ).toBeInTheDocument();
  });

  it('Dado estornar uma quitação, quando confirmo com o motivo, então estorna a movimentação e recarrega a dívida', async () => {
    const debts = new DebtsGatewayStub();
    debts.debts = [aDebt()];
    const { transactions, fixture } = await setup(debts);

    await userEvent.click(screen.getByTestId('debt-settlement-reverse-tx-pay-1'));
    await userEvent.type(screen.getByTestId('confirm-dialog-reason'), 'lancei errado');
    await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    await fixture.whenStable();

    expect(transactions.voids).toEqual([{ id: 'tx-pay-1', reason: 'lancei errado' }]);
    expect(debts.calls.filter((call) => call === 'get:debt-1').length).toBeGreaterThan(1);
  });

  it('Dado DEBT_CLOSED ao estornar a quitação, então mostra o motivo traduzido', async () => {
    const debts = new DebtsGatewayStub();
    debts.debts = [aDebt()];
    const transactions = new TransactionsGatewayStub();
    transactions.void$ = failWith(422, 'DEBT_CLOSED');
    const { fixture } = await setup(debts, transactions);

    await userEvent.click(screen.getByTestId('debt-settlement-reverse-tx-pay-1'));
    await userEvent.type(screen.getByTestId('confirm-dialog-reason'), 'x');
    await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(screen.getByTestId('debt-reverse-error')).toHaveTextContent(
      pt.errors.codes['DEBT_CLOSED']!,
    );
  });

  describe('perdoar', () => {
    it('Dado perdoar, então o diálogo exige motivo e diz que não pode ser desfeito; depois a dívida fica "Perdoada" e as ações somem', async () => {
      const debts = new DebtsGatewayStub();
      debts.debts = [aDebt()];
      const { fixture } = await setup(debts);

      await userEvent.click(screen.getByTestId('debt-forgive'));
      expect(screen.getByRole('dialog')).toHaveTextContent('não pode ser desfeito');
      expect(screen.getByTestId('confirm-dialog-confirm')).toBeDisabled();
      await userEvent.type(screen.getByTestId('confirm-dialog-reason'), 'combinado');
      await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(debts.reasons).toEqual(['combinado']);
      expect(text(screen.getByTestId('debt-status'))).toBe('Perdoada');
      expect(screen.queryByTestId('debt-forgive')).not.toBeInTheDocument();
      expect(screen.queryByTestId('debt-settle')).not.toBeInTheDocument();
      expect(screen.getByTestId('debt-closure-reason')).toHaveTextContent('combinado');
    });

    it('Dado dívida que não é perdoável (quitada), então a ação não aparece', async () => {
      const debts = new DebtsGatewayStub();
      debts.debts = [aDebt({ status: 'SETTLED', cancelable: false, outstanding: brl('0.00') })];
      await setup(debts);

      expect(screen.queryByTestId('debt-forgive')).not.toBeInTheDocument();
      expect(screen.queryByTestId('debt-settle')).not.toBeInTheDocument();
    });
  });

  describe('estornar o registro', () => {
    it('Dado dívida com quitação (DEBT_HAS_SETTLEMENTS), então a ação fica desabilitada com a explicação e o caminho', async () => {
      const debts = new DebtsGatewayStub();
      debts.debts = [
        aDebt({
          origin: 'WITHOUT_MOVEMENT',
          originTransactionId: null,
          voidable: false,
          voidBlockedBy: 'DEBT_HAS_SETTLEMENTS',
        }),
      ];
      await setup(debts);

      const button = screen.getByTestId('debt-void');
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveAccessibleDescription(pt.debts.detail.voidBlocked.DEBT_HAS_SETTLEMENTS);
      expect(screen.getByTestId('debt-void-blocked')).toHaveTextContent(
        pt.debts.detail.voidBlocked.DEBT_HAS_SETTLEMENTS,
      );
      await userEvent.click(button);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('Dado dívida que nasceu de uma movimentação, então explica que o caminho é estornar a origem', async () => {
      const debts = new DebtsGatewayStub();
      debts.debts = [aDebt()];
      await setup(debts);

      expect(screen.getByTestId('debt-void-blocked')).toHaveTextContent(
        pt.debts.detail.voidBlocked.HAS_ORIGIN_TRANSACTION,
      );
    });

    it('Dado dívida sem movimentação e sem quitações, então estorna o registro com motivo e mostra "Estornada"', async () => {
      const debts = new DebtsGatewayStub();
      debts.debts = [
        aDebt({
          origin: 'WITHOUT_MOVEMENT',
          originTransactionId: null,
          settlements: [],
          settled: brl('0.00'),
          outstanding: brl('80.00'),
          principal: brl('80.00'),
          status: 'OPEN',
          voidable: true,
          voidBlockedBy: null,
        }),
      ];
      const { fixture } = await setup(debts);

      await userEvent.click(screen.getByTestId('debt-void'));
      await userEvent.type(screen.getByTestId('confirm-dialog-reason'), 'duplicada');
      await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(debts.calls).toContain('void:debt-1');
      expect(text(screen.getByTestId('debt-status'))).toBe('Estornada');
    });

    it('Dado DEBT_HAS_SETTLEMENTS vindo do backend, então avisa e recarrega a dívida', async () => {
      const debts = new DebtsGatewayStub();
      debts.debts = [
        aDebt({
          origin: 'WITHOUT_MOVEMENT',
          originTransactionId: null,
          voidable: true,
          voidBlockedBy: null,
        }),
      ];
      const { fixture } = await setup(debts);
      debts.next = failWith(422, 'DEBT_HAS_SETTLEMENTS');

      await userEvent.click(screen.getByTestId('debt-void'));
      await userEvent.type(screen.getByTestId('confirm-dialog-reason'), 'x');
      await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(screen.getByTestId('debt-action-error')).toHaveTextContent(
        pt.errors.codes['DEBT_HAS_SETTLEMENTS']!,
      );
    });
  });

  it('Dado dívida sem movimentação com categoria, então mostra a categoria', async () => {
    const debts = new DebtsGatewayStub();
    debts.debts = [
      aDebt({
        origin: 'WITHOUT_MOVEMENT',
        originTransactionId: null,
        category: { id: 'c1', name: 'Alimentação' },
      }),
    ];
    await setup(debts);

    expect(text(screen.getByTestId('debt-field-category'))).toContain('Alimentação');
    expect(screen.queryByTestId('debt-origin-link')).not.toBeInTheDocument();
    expect(screen.getByTestId('debt-field-origin')).toHaveTextContent(
      'não mexe no saldo das contas',
    );
  });

  it('Dado "Registrar devolução", então abre a folha de quitação com o outstanding do backend', async () => {
    const debts = new DebtsGatewayStub();
    debts.debts = [aDebt()];
    await setup(debts);

    await userEvent.click(screen.getByTestId('debt-settle'));

    expect(screen.getByTestId('settle-sheet-panel')).toBeInTheDocument();
    expect((screen.getByTestId('settle-amount') as HTMLInputElement).value).toBe('200,00');
  });

  it('Dado editar, então o formulário vem com a descrição e a previsão e salva com a version', async () => {
    const debts = new DebtsGatewayStub();
    debts.debts = [aDebt({ version: 7 })];
    const { fixture } = await setup(debts);

    await userEvent.click(screen.getByTestId('debt-edit'));
    const description = screen.getByTestId('debt-edit-description') as HTMLInputElement;
    expect(description.value).toBe('Empréstimo');
    await userEvent.clear(description);
    await userEvent.type(description, 'Empréstimo do carro');
    await userEvent.click(screen.getByTestId('debt-edit-save'));
    await fixture.whenStable();

    expect(debts.updates[0]).toMatchObject({ description: 'Empréstimo do carro', version: 7 });
  });

  it('Dado 409 VERSION_CONFLICT ao editar, então avisa na folha e a dívida é recarregada', async () => {
    const debts = new DebtsGatewayStub();
    debts.debts = [aDebt()];
    const { fixture } = await setup(debts);
    await userEvent.click(screen.getByTestId('debt-edit'));
    debts.next = failWith(409, 'VERSION_CONFLICT');

    await userEvent.click(screen.getByTestId('debt-edit-save'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(screen.getByTestId('debt-edit-conflict')).toHaveTextContent(pt.debts.edit.conflict);
  });

  it('Dado atrasada, então diz "Atrasada" em texto', async () => {
    const debts = new DebtsGatewayStub();
    debts.debts = [aDebt({ overdue: true })];
    await setup(debts);

    expect(screen.getByTestId('debt-overdue')).toHaveTextContent(pt.debts.detail.overdue);
  });

  it('Dado a carga, então mostra o esqueleto com texto para leitor de tela', async () => {
    const debts = new DebtsGatewayStub();
    debts.getResult = NEVER as never;
    await render(DebtPage, {
      inputs: { id: 'debt-1' },
      providers: [
        provideI18nTesting('pt'),
        provideNotesStub(),
        provideRouter([]),
        provideDebtsStub(debts),
        provideTransactionsStub(),
        provideAccountsStub(),
      ],
    });

    expect(screen.getByTestId('debt-loading')).toHaveTextContent(pt.debts.detail.loading);
  });

  it('Dado 404, então "dívida não encontrada" com o caminho de volta', async () => {
    const debts = new DebtsGatewayStub();
    debts.getResult = failWith(404, 'DEBT_NOT_FOUND');
    await setup(debts);

    expect(screen.getByTestId('empty-state-title')).toHaveTextContent(
      pt.debts.detail.notFound.title,
    );
    expect(screen.getByTestId('empty-state-action-back')).toHaveAttribute('href', '/people');
  });

  it('Dado erro de rede, então mostra o erro com "tentar de novo" e recarrega', async () => {
    const debts = new DebtsGatewayStub();
    debts.getResult = failWith(0, 'NETWORK');
    await setup(debts);
    expect(screen.getByTestId('error-state')).toBeInTheDocument();

    debts.getResult = null;
    debts.debts = [aDebt()];
    await userEvent.click(screen.getByTestId('empty-state-action-retry'));

    expect(await screen.findByTestId('debt-summary')).toBeInTheDocument();
  });

  it('Dado a dívida, então o axe não aponta violações', async () => {
    const debts = new DebtsGatewayStub();
    debts.debts = [aDebt()];
    const { container } = await setup(debts);

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it('Dado dívida com credor livre (person nulo), então mostra o credor sem link de pessoa e não quebra', async () => {
    const debts = new DebtsGatewayStub();
    debts.debts = [
      aDebt({
        person: null,
        creditorName: 'Banco Azul',
        direction: 'PAYABLE',
        description: null,
        origin: 'WITHOUT_MOVEMENT',
        originTransactionId: null,
      }),
    ];
    await setup(debts);

    expect(screen.getByTestId('debt-creditor-name')).toHaveTextContent('Banco Azul');
    expect(screen.queryByTestId('debt-person-link')).not.toBeInTheDocument();
    expect(screen.getByTestId('debt-field-person')).toHaveTextContent(pt.debts.detail.creditor);
  });
});

void aTransaction;
