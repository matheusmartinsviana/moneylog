import { TestBed } from '@angular/core/testing';
import { NEVER, Subject } from 'rxjs';

import {
  ONGOING_PREVIEW_DEBOUNCE_MS,
  OngoingInstallmentsFacade,
} from '~/modules/debt-overview/core/facades/ongoing-installments.facade';
import type { OngoingInstallmentsInput } from '~/modules/debt-overview/core/types/debt-overview';
import { failWith } from '~/testing/accounts-testing';
import { DebtOverviewGatewayStub, provideDebtOverviewStub } from '~/testing/debt-overview-testing';

const input: OngoingInstallmentsInput = {
  description: 'Notebook',
  installmentAmount: '150.00',
  totalInstallments: 10,
  remainingInstallments: 8,
  firstInvoiceDate: null,
};

function setup(stub = new DebtOverviewGatewayStub()) {
  vi.useFakeTimers();
  TestBed.configureTestingModule({
    providers: [provideDebtOverviewStub(stub), OngoingInstallmentsFacade],
  });
  return { stub, facade: TestBed.inject(OngoingInstallmentsFacade) };
}

describe('OngoingInstallmentsFacade', () => {
  afterEach(() => vi.useRealTimers());

  it('Dado dados completos, então a prévia é a do servidor, depois da espera de digitação', () => {
    const { facade, stub } = setup();

    facade.requestPreview('card-1', input);
    expect(facade.previewLoading()).toBe(true);
    vi.advanceTimersByTime(ONGOING_PREVIEW_DEBOUNCE_MS);

    expect(stub.previews).toEqual([{ cardId: 'card-1', input }]);
    expect(facade.preview()?.remaining.amount).toBe('1200.00');
    expect(facade.preview()?.remainingInstallments).toBe(8);
  });

  it('Dado mudar os dados antes da resposta, então só a última combinação é pedida', () => {
    const { facade, stub } = setup();

    facade.requestPreview('card-1', input);
    vi.advanceTimersByTime(100);
    facade.requestPreview('card-1', { ...input, remainingInstallments: 5 });
    vi.advanceTimersByTime(ONGOING_PREVIEW_DEBOUNCE_MS);

    expect(stub.previews).toHaveLength(1);
    expect(stub.previews[0]?.input.remainingInstallments).toBe(5);
  });

  it('Dado dados incompletos, então a prévia é limpa', () => {
    const { facade } = setup();
    facade.requestPreview('card-1', input);
    vi.advanceTimersByTime(ONGOING_PREVIEW_DEBOUNCE_MS);

    facade.requestPreview('card-1', null);

    expect(facade.preview()).toBeNull();
    expect(facade.previewLoading()).toBe(false);
  });

  it('Dado falha na prévia, então o erro do servidor fica disponível', () => {
    const stub = new DebtOverviewGatewayStub();
    stub.previewResult = failWith(422, 'ONGOING_INVALID_COUNT');
    const { facade } = setup(stub);

    facade.requestPreview('card-1', input);
    vi.advanceTimersByTime(ONGOING_PREVIEW_DEBOUNCE_MS);

    expect(facade.previewProblem()).toMatchObject({ code: 'ONGOING_INVALID_COUNT' });
  });

  it('Dado duplo toque em salvar, então só um envio acontece e emite a compra criada', () => {
    const stub = new DebtOverviewGatewayStub();
    const pending = new Subject<string>();
    stub.createResult = pending;
    const { facade } = setup(stub);
    const saved: string[] = [];
    facade.saved$.subscribe((id) => saved.push(id));

    facade.save('card-1', input);
    facade.save('card-1', input);
    expect(facade.saving()).toBe(true);
    pending.next('tx-9');
    pending.complete();

    expect(stub.creates).toHaveLength(1);
    expect(saved).toEqual(['tx-9']);
    expect(facade.saving()).toBe(false);
  });

  it('Dado 422 ao salvar, então o problema chega tipado e libera o botão', () => {
    const stub = new DebtOverviewGatewayStub();
    stub.createResult = failWith(422, 'ONGOING_FIRST_INVOICE_NOT_PAYABLE');
    const { facade } = setup(stub);

    facade.save('card-1', input);

    expect(facade.problem()).toMatchObject({ code: 'ONGOING_FIRST_INVOICE_NOT_PAYABLE' });
    expect(facade.saving()).toBe(false);
  });

  it('Dado salvar em andamento, então enquanto isso a prévia pendente não bloqueia o estado', () => {
    const stub = new DebtOverviewGatewayStub();
    stub.createResult = NEVER;
    const { facade } = setup(stub);

    facade.save('card-1', input);

    expect(facade.saving()).toBe(true);
  });
});
