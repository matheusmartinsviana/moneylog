import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { Subject } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { ToastService } from '~/app/common/services/toast.service';
import { SettleSheetComponent } from '~/app/features/debts/components/settle-sheet/settle-sheet.component';
import { anAccount, brl, failWith } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { aDebt } from '~/testing/debts-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';
import {
  aTransaction,
  provideTransactionsStub,
  TransactionsGatewayStub,
} from '~/testing/transactions-testing';
import { todayIso } from '~/util/date';

vi.setConfig({ testTimeout: 20_000 });

const NUBANK = anAccount({ id: 'acc-1', name: 'Nubank' });
const WALLET = anAccount({ id: 'acc-2', name: 'Carteira', type: 'WALLET' });
const field = (id: string) => screen.getByTestId(id) as HTMLInputElement;

async function setup({
  gateway = new TransactionsGatewayStub(),
  accounts = [NUBANK, WALLET],
  defaultAccountId = 'acc-1' as string | null,
  debt = aDebt(),
} = {}) {
  const closed = vi.fn();
  const settled = vi.fn();
  const result = await render(SettleSheetComponent, {
    inputs: { open: true, debt, accounts, defaultAccountId },
    on: { closed, settled },
    providers: [provideI18nTesting('pt'), provideRouter([]), provideTransactionsStub(gateway)],
  });
  await result.fixture.whenStable();
  return { ...result, gateway, closed, settled, toast: TestBed.inject(ToastService) };
}

describe('SettleSheetComponent', () => {
  it('Dado uma dívida de 300,00 com 100,00 pagos, então o valor sugerido é o outstanding do backend (200,00)', async () => {
    await setup({ debt: aDebt({ principal: brl('300.00'), outstanding: brl('200.00') }) });

    expect(screen.getByTestId('settle-sheet-panel')).toHaveTextContent(
      pt.debts.settle.titleReceivable,
    );
    expect(field('settle-amount').value).toBe('200,00');
    expect(screen.getByTestId('settle-account')).toHaveTextContent('Nubank');
    expect(screen.getByText(/Falta R\$\s200,00/)).toBeInTheDocument();
  });

  it('Dado que as contas chegam depois de a folha abrir, então a conta única entra sozinha (e uma já escolhida não muda)', async () => {
    const { rerender, fixture } = await setup({ accounts: [], defaultAccountId: null });
    expect(screen.queryByTestId('settle-account')).not.toBeInTheDocument();

    await rerender({ inputs: { accounts: [NUBANK] }, partialUpdate: true });
    await fixture.whenStable();
    expect(screen.getByTestId('settle-account')).toHaveTextContent('Nubank');

    // Já há uma conta escolhida: uma lista nova não troca a escolha.
    await rerender({ inputs: { accounts: [WALLET, NUBANK] }, partialUpdate: true });
    await fixture.whenStable();
    expect(screen.getByTestId('settle-account')).toHaveTextContent('Nubank');
  });

  it('Dado o outstanding do backend diferente da conta feita à mão, então a sugestão é a do backend', async () => {
    await setup({
      debt: aDebt({ principal: brl('300.00'), settled: brl('100.00'), outstanding: brl('199.99') }),
    });

    expect(field('settle-amount').value).toBe('199,99');
  });

  it('Dado "me devem", quando registro, então envia MONEY_RECEIVED com debtId (nunca receita) e uma Idempotency-Key', async () => {
    const { gateway, settled, toast, fixture } = await setup();

    await userEvent.click(screen.getByTestId('settle-submit'));
    await fixture.whenStable();

    expect(gateway.creates).toHaveLength(1);
    expect(gateway.creates[0]?.input).toMatchObject({
      type: 'MONEY_RECEIVED',
      amount: '200.00',
      accountId: 'acc-1',
      debtId: 'debt-1',
      newDebt: null,
      date: todayIso(),
      description: 'Devolução de João',
    });
    expect(gateway.creates[0]?.key).toBeTruthy();
    expect(toast.toasts()[0]?.message).toBe(pt.debts.settle.toastReceivable);
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it('Dado "eu devo", então é "Pagar dívida" e envia DEBT_PAYMENT', async () => {
    const { gateway, toast, fixture } = await setup({
      debt: aDebt({ direction: 'PAYABLE', outstanding: brl('80.00'), principal: brl('80.00') }),
    });

    expect(screen.getByTestId('settle-sheet-panel')).toHaveTextContent(
      pt.debts.settle.titlePayable,
    );
    await userEvent.click(screen.getByTestId('settle-submit'));
    await fixture.whenStable();

    expect(gateway.creates[0]?.input).toMatchObject({
      type: 'DEBT_PAYMENT',
      amount: '80.00',
      debtId: 'debt-1',
    });
    expect(toast.toasts()[0]?.message).toBe(pt.debts.settle.toastPayable);
  });

  it('Dado um valor maior, então o erro do backend (S-143) vai ao campo do valor, traduzido, sem o front calcular', async () => {
    const gateway = new TransactionsGatewayStub();
    gateway.create$ = failWith(422, 'DEBT_SETTLEMENT_EXCEEDS_OUTSTANDING');
    const { fixture } = await setup({ gateway });
    await userEvent.clear(field('settle-amount'));
    await userEvent.type(field('settle-amount'), '250,00');

    await userEvent.click(screen.getByTestId('settle-submit'));
    fixture.detectChanges();

    expect(gateway.creates[0]?.input.amount).toBe('250.00');
    expect(
      screen.getByText(pt.errors.codes['DEBT_SETTLEMENT_EXCEEDS_OUTSTANDING']!),
    ).toBeInTheDocument();
    expect(field('settle-amount')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByTestId('settle-error')).not.toBeInTheDocument();
  });

  it('Dado o clique duplo, então uma requisição só', async () => {
    const gateway = new TransactionsGatewayStub();
    gateway.create$ = new Subject<ReturnType<typeof aTransaction>>();
    await setup({ gateway });

    const submit = screen.getByTestId('settle-submit');
    await userEvent.dblClick(submit);

    expect(gateway.creates).toHaveLength(1);
    expect(submit).toBeDisabled();
  });

  it.each([
    ['rede', 0, 'NETWORK'],
    ['5xx', 503, 'INTERNAL_ERROR'],
    ['409 CONFLICT', 409, 'CONFLICT'],
  ])(
    'Dado falha ambígua (%s), então "tentar de novo" reenvia com a MESMA Idempotency-Key',
    async (_, status, code) => {
      const gateway = new TransactionsGatewayStub();
      gateway.create$ = failWith(status, code);
      await setup({ gateway });

      await userEvent.click(screen.getByTestId('settle-submit'));
      expect(screen.getByTestId('settle-error')).toBeInTheDocument();
      gateway.create$ = aTransactionOf();
      await userEvent.click(screen.getByTestId('settle-retry'));

      expect(gateway.creates).toHaveLength(2);
      expect(gateway.creates[1]?.key).toBe(gateway.creates[0]?.key);
    },
  );

  it('Dado resposta perdida, quando fecho e reabro a folha e envio de novo, então é a mesma Idempotency-Key', async () => {
    const gateway = new TransactionsGatewayStub();
    gateway.create$ = failWith(0, 'NETWORK');
    const { fixture } = await setup({ gateway });

    await userEvent.click(screen.getByTestId('settle-submit'));
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(screen.getByTestId('settle-retry')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('settle-submit'));

    expect(gateway.creates).toHaveLength(2);
    expect(gateway.creates[1]?.key).toBe(gateway.creates[0]?.key);
  });

  it('Dado uma recusa definitiva (422), quando reabro a folha, então o erro some e a próxima tentativa usa chave nova', async () => {
    const gateway = new TransactionsGatewayStub();
    gateway.create$ = failWith(422, 'DEBT_CLOSED');
    const { fixture } = await setup({ gateway });

    await userEvent.click(screen.getByTestId('settle-submit'));
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(screen.queryByTestId('settle-retry')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settle-error')).not.toBeInTheDocument();
  });

  it('Dado nenhuma conta que sirva, então pede para cadastrar uma e não oferece o formulário', async () => {
    await setup({ accounts: [] });

    expect(screen.getByTestId('settle-no-accounts')).toHaveTextContent(pt.debts.settle.noAccounts);
    expect(screen.getByTestId('settle-add-account')).toHaveAttribute('href', '/accounts/new');
    expect(screen.queryByTestId('settle-form')).not.toBeInTheDocument();
  });

  it('Dado Esc ou "Cancelar", então fecha sem enviar nada', async () => {
    const { gateway, closed } = await setup();

    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByTestId('settle-cancel'));

    expect(closed).toHaveBeenCalledTimes(2);
    expect(gateway.creates).toHaveLength(0);
  });

  it('Dado a folha aberta, então é um diálogo nomeado, com o foco dentro, e o axe não aponta violações', async () => {
    await setup();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName(pt.debts.settle.titleReceivable);
    expect(dialog.contains(document.activeElement)).toBe(true);
    const violations = await axeViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});

function aTransactionOf() {
  const gateway = new TransactionsGatewayStub();
  return gateway.create$;
}
