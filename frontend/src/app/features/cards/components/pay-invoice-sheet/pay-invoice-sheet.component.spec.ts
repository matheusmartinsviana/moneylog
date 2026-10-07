import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, Subject } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { ToastService } from '~/app/common/services/toast.service';
import { PayInvoiceSheetComponent } from '~/app/features/cards/components/pay-invoice-sheet/pay-invoice-sheet.component';
import { anAccount, brl, failWith } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import {
  anInvoice,
  anInvoiceSummary,
  aPaymentPreview,
  CardsGatewayStub,
  provideCardsStub,
} from '~/testing/cards-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { todayIso } from '~/util/date';

vi.setConfig({ testTimeout: 20_000 });

const NUBANK = anAccount({ id: 'acc-1', name: 'Nubank' });
const WALLET = anAccount({ id: 'acc-2', name: 'Carteira', type: 'WALLET' });
const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, ' ').trim();
const field = (id: string) => screen.getByTestId(id) as HTMLInputElement;

async function setup({
  gateway = new CardsGatewayStub(),
  accounts = [NUBANK, WALLET],
  defaultAccountId = 'acc-1' as string | null,
  invoice = anInvoiceSummary({ id: 'inv-1', status: 'CLOSED', outstanding: brl('1283.00') }),
} = {}) {
  const closed = vi.fn();
  const paid = vi.fn();
  const result = await render(PayInvoiceSheetComponent, {
    inputs: { open: true, invoice, accounts, defaultAccountId },
    on: { closed, paid },
    providers: [provideI18nTesting('pt'), provideRouter([]), provideCardsStub(gateway)],
  });
  await result.fixture.whenStable();
  return { ...result, gateway, closed, paid, toast: TestBed.inject(ToastService) };
}

describe('PayInvoiceSheetComponent', () => {
  it('Dado a fatura fechada de 1.283,00, então o valor vem com o outstanding recebido e a conta com a padrão do cartão', async () => {
    await setup();

    expect(screen.getByTestId('pay-sheet-panel')).toHaveTextContent('Pagar a fatura de nov/2026');
    expect(field('pay-amount').value).toBe('1.283,00');
    expect(screen.getByTestId('pay-account')).toHaveTextContent('Nubank');
    expect(field('pay-date').value).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('Dado fatura sem saldo (0,00), então o valor começa vazio e nenhuma prévia é pedida', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { gateway } = await setup({
        invoice: anInvoiceSummary({ id: 'inv-1', status: 'OPEN', outstanding: brl('0.00') }),
      });
      await vi.advanceTimersByTimeAsync(400);

      expect(field('pay-amount').value).toBe('');
      expect(gateway.paymentPreviewCalls).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('Dado trocar a conta, então nada é recalculado e nenhuma prévia nova é pedida', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { gateway, fixture } = await setup();
      await vi.advanceTimersByTimeAsync(300);
      const calls = gateway.paymentPreviewCalls.length;

      await userEvent.click(screen.getByTestId('pay-account'));
      await userEvent.click(screen.getByTestId('pay-account-option-acc-2'));
      await vi.advanceTimersByTimeAsync(600);
      await fixture.whenStable();

      expect(gateway.paymentPreviewCalls).toHaveLength(calls);
      expect(field('pay-amount').value).toBe('1.283,00');
    } finally {
      vi.useRealTimers();
    }
  });

  describe('prévia do backend', () => {
    beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
    afterEach(() => vi.useRealTimers());

    const typeAmount = async (value: string) => {
      await userEvent.clear(field('pay-amount'));
      await userEvent.type(field('pay-amount'), value);
    };

    it('Dado o valor digitado, então espera 300 ms, pede a prévia só da última digitação e mostra PARTIAL com os números recebidos', async () => {
      const gateway = new CardsGatewayStub();
      // Não bate com a conta de propósito: 1.283,00 − 500,00 seria 783,00.
      gateway.paymentPreview$ = of(
        aPaymentPreview({ kind: 'PARTIAL', outstandingAfter: brl('777.77') }),
      );
      const { fixture } = await setup({ gateway });
      await vi.advanceTimersByTimeAsync(300);
      gateway.paymentPreviewCalls.length = 0;

      await typeAmount('500,00');
      expect(screen.getByTestId('pay-preview-loading')).toBeInTheDocument();
      await vi.advanceTimersByTimeAsync(300);
      fixture.detectChanges();

      expect(gateway.paymentPreviewCalls.at(-1)).toEqual({ invoiceId: 'inv-1', amount: '500.00' });
      expect(text(screen.getByTestId('pay-preview-text'))).toBe('Restam R$ 777,77 nesta fatura.');
    });

    it('Dado OVERPAY, então "R$ … viram crédito na próxima fatura" com o creditCarryAfter do backend', async () => {
      const gateway = new CardsGatewayStub();
      gateway.paymentPreview$ = of(
        aPaymentPreview({
          kind: 'OVERPAY',
          outstandingAfter: brl('0.00'),
          creditCarryAfter: brl('17.00'),
        }),
      );
      const { fixture } = await setup({ gateway });

      await typeAmount('1.300,00');
      await vi.advanceTimersByTimeAsync(300);
      fixture.detectChanges();

      expect(text(screen.getByTestId('pay-preview-text'))).toBe(
        'R$ 17,00 viram crédito na próxima fatura.',
      );
    });

    it('Dado PREPAY e FULL, então mostra "pagamento antecipado" e "quita a fatura"', async () => {
      const gateway = new CardsGatewayStub();
      gateway.paymentPreview$ = of(aPaymentPreview({ kind: 'PREPAY' }));
      const { fixture } = await setup({ gateway });
      await vi.advanceTimersByTimeAsync(300);
      fixture.detectChanges();
      expect(screen.getByTestId('pay-preview-text')).toHaveTextContent(pt.cards.pay.preview.PREPAY);

      gateway.paymentPreview$ = of(aPaymentPreview({ kind: 'FULL' }));
      await typeAmount('1.283,00');
      await vi.advanceTimersByTimeAsync(300);
      fixture.detectChanges();
      expect(screen.getByTestId('pay-preview-text')).toHaveTextContent(pt.cards.pay.preview.FULL);
    });

    it('Dado erro na prévia, então avisa que é só informativo e o pagamento continua possível', async () => {
      const gateway = new CardsGatewayStub();
      gateway.paymentPreview$ = failWith(500, 'INTERNAL_ERROR');
      const { fixture } = await setup({ gateway });
      await vi.advanceTimersByTimeAsync(300);
      fixture.detectChanges();

      expect(screen.getByTestId('pay-preview-unavailable')).toHaveTextContent(
        pt.cards.pay.preview.unavailable,
      );
      await userEvent.click(screen.getByTestId('pay-submit'));
      expect(gateway.paymentCalls).toHaveLength(1);
    });

    it('Dado valor inválido (vazio), então a prévia some e nada é pedido', async () => {
      const { fixture, gateway } = await setup();
      await vi.advanceTimersByTimeAsync(300);
      gateway.paymentPreviewCalls.length = 0;

      await userEvent.clear(field('pay-amount'));
      await vi.advanceTimersByTimeAsync(500);
      fixture.detectChanges();

      expect(gateway.paymentPreviewCalls).toHaveLength(0);
      expect(screen.queryByTestId('pay-preview-text')).not.toBeInTheDocument();
    });
  });

  it('Dado data futura, então avisa "pagamento agendado"; hoje, não', async () => {
    const { fixture } = await setup();
    expect(screen.queryByTestId('pay-scheduled')).not.toBeInTheDocument();

    const future = new Date(Date.now() + 5 * 24 * 3600 * 1000);
    const day = todayIso(future);
    const [y, m, d] = day.split('-');
    await userEvent.clear(field('pay-date'));
    await userEvent.type(field('pay-date'), `${d}/${m}/${y}`);
    fixture.detectChanges();

    expect(screen.getByTestId('pay-scheduled')).toHaveTextContent(pt.cards.pay.scheduled);
  });

  describe('envio', () => {
    it('Dado o envio, então chama o pagamento com conta, valor e data, mostra o toast e entrega a fatura da resposta', async () => {
      const { gateway, paid, toast, fixture } = await setup();

      await userEvent.click(screen.getByTestId('pay-submit'));
      await fixture.whenStable();

      expect(gateway.paymentCalls).toHaveLength(1);
      expect(gateway.paymentCalls[0]).toMatchObject({
        invoiceId: 'inv-1',
        input: { accountId: 'acc-1', amount: '1283.00', date: todayIso() },
      });
      expect(gateway.paymentCalls[0]?.key).toBeTruthy();
      expect(toast.toasts()[0]?.message).toBe(pt.cards.pay.toast);
      expect(paid).toHaveBeenCalledTimes(1);
      expect((paid.mock.calls[0]![0] as { id: string }).id).toBe('inv-1');
    });

    it('Dado o clique duplo, então uma requisição só', async () => {
      const gateway = new CardsGatewayStub();
      gateway.pay$ = new Subject<ReturnType<typeof anInvoice>>();
      await setup({ gateway });

      const submit = screen.getByTestId('pay-submit');
      await userEvent.dblClick(submit);

      expect(gateway.paymentCalls).toHaveLength(1);
      expect(submit).toBeDisabled();
    });

    it('Dado erro de rede, então "tentar de novo" reenvia com a mesma Idempotency-Key', async () => {
      const gateway = new CardsGatewayStub();
      gateway.pay$ = failWith(0, 'NETWORK');
      await setup({ gateway });

      await userEvent.click(screen.getByTestId('pay-submit'));
      expect(screen.getByTestId('pay-error')).toHaveTextContent(pt.errors.codes['NETWORK']!);
      gateway.pay$ = null;
      await userEvent.click(screen.getByTestId('pay-retry'));

      expect(gateway.paymentCalls).toHaveLength(2);
      expect(gateway.paymentCalls[1]?.key).toBe(gateway.paymentCalls[0]?.key);
    });

    it('Dado resposta perdida, quando fecho e reabro a folha e pago de novo, então é uma só Idempotency-Key', async () => {
      const gateway = new CardsGatewayStub();
      gateway.pay$ = failWith(0, 'NETWORK');
      const { fixture } = await setup({ gateway });

      await userEvent.click(screen.getByTestId('pay-submit'));
      fixture.componentRef.setInput('open', false);
      fixture.detectChanges();
      fixture.componentRef.setInput('open', true);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(screen.getByTestId('pay-retry')).toBeInTheDocument();
      await userEvent.click(screen.getByTestId('pay-submit'));

      expect(gateway.paymentCalls).toHaveLength(2);
      expect(gateway.paymentCalls[1]?.key).toBe(gateway.paymentCalls[0]?.key);
    });

    it('Dado INVOICE_NOT_PAYABLE, então o texto traduzido aparece no rodapé', async () => {
      const gateway = new CardsGatewayStub();
      gateway.pay$ = failWith(422, 'INVOICE_NOT_PAYABLE');
      await setup({ gateway });

      await userEvent.click(screen.getByTestId('pay-submit'));

      expect(screen.getByTestId('pay-error')).toHaveTextContent(
        pt.errors.codes['INVOICE_NOT_PAYABLE']!,
      );
    });

    it.each(['TRANSACTION_ACCOUNT_NOT_CASH', 'ACCOUNT_ARCHIVED'])(
      'Dado %s, então o erro vai ao campo da conta, com texto traduzido',
      async (code) => {
        const gateway = new CardsGatewayStub();
        gateway.pay$ = failWith(422, code);
        const { fixture } = await setup({ gateway });

        await userEvent.click(screen.getByTestId('pay-submit'));
        fixture.detectChanges();

        expect(screen.getByText(pt.errors.codes[code]!)).toBeInTheDocument();
        expect(screen.queryByTestId('pay-error')).not.toBeInTheDocument();
      },
    );

    it('Dado valor vazio, quando envio, então o erro é do campo e nada é enviado', async () => {
      const { gateway, fixture } = await setup();
      await userEvent.clear(field('pay-amount'));

      await userEvent.click(screen.getByTestId('pay-submit'));
      fixture.detectChanges();

      expect(gateway.paymentCalls).toHaveLength(0);
      expect(field('pay-amount')).toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('acessibilidade', () => {
    it('Dado a folha aberta, então é um diálogo com o título anunciado e o foco dentro dela', async () => {
      await setup();

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAccessibleName('Pagar a fatura de nov/2026');
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    it('Dado Esc, então fecha sem enviar nada', async () => {
      const { gateway, closed } = await setup();

      await userEvent.keyboard('{Escape}');

      expect(closed).toHaveBeenCalledTimes(1);
      expect(gateway.paymentCalls).toHaveLength(0);
    });

    it('Dado "Cancelar", então fecha sem enviar', async () => {
      const { gateway, closed } = await setup();

      await userEvent.click(screen.getByTestId('pay-cancel'));

      expect(closed).toHaveBeenCalledTimes(1);
      expect(gateway.paymentCalls).toHaveLength(0);
    });

    it('Dado a folha, então o axe não aponta violações', async () => {
      await setup();

      const violations = await axeViolations(document.body);
      expect(violations, describeViolations(violations)).toEqual([]);
    });
  });

  it('Dado nenhuma conta que pague, então pede para cadastrar uma e não oferece o formulário', async () => {
    await setup({ accounts: [] });

    expect(screen.getByTestId('pay-no-accounts')).toHaveTextContent(pt.cards.pay.noAccounts);
    expect(screen.getByTestId('pay-add-account')).toHaveAttribute('href', '/accounts/new');
    expect(screen.queryByTestId('pay-form')).not.toBeInTheDocument();
  });

  it('Dado a conta padrão que não está entre as contas que pagam, então não escolhe nenhuma (ou a única)', async () => {
    await setup({ defaultAccountId: 'acc-x', accounts: [NUBANK] });

    expect(screen.getByTestId('pay-account')).toHaveTextContent('Nubank');
  });
});
