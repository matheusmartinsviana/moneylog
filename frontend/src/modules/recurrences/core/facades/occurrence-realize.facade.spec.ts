import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { OccurrenceRealizeFacade } from '~/modules/recurrences/core/facades/occurrence-realize.facade';
import { failWith } from '~/testing/accounts-testing';
import {
  aRealized,
  provideRecurrencesStub,
  RecurrencesGatewayStub,
} from '~/testing/recurrences-testing';

function setup(gateway = new RecurrencesGatewayStub()) {
  TestBed.configureTestingModule({
    providers: [provideRecurrencesStub(gateway), OccurrenceRealizeFacade],
  });
  return { gateway, facade: TestBed.inject(OccurrenceRealizeFacade) };
}

describe('OccurrenceRealizeFacade', () => {
  it('Dado realizar, então emite a movimentação da resposta e envia uma Idempotency-Key', () => {
    const { facade, gateway } = setup();
    const realized: string[] = [];
    facade.realized$.subscribe((tx) => realized.push(`${tx.id}:${tx.amount.amount}`));

    facade.realize('rec-1', '2026-10-10', '124.90');

    expect(realized).toEqual(['tx-rec-1:124.90']);
    expect(gateway.realizations[0]).toMatchObject({ recurrenceId: 'rec-1', amount: '124.90' });
    expect(gateway.realizations[0]?.key).toBeTruthy();
  });

  it('Dado recorrência sem conta, então a conta e o meio vão na confirmação', () => {
    const { facade, gateway } = setup();

    facade.realize('rec-1', '2026-10-10', null, { accountId: 'acc-1', method: 'PIX' });

    expect(gateway.realizations[0]?.payment).toEqual({ accountId: 'acc-1', method: 'PIX' });
  });

  it('Dado RECURRENCE_ACCOUNT_REQUIRED, então o erro fica tipado e a tentativa não fica pendente', () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.realize$ = failWith(422, 'RECURRENCE_ACCOUNT_REQUIRED');
    const { facade } = setup(gateway);

    facade.realize('rec-1', '2026-10-10', null);

    expect(facade.problem()?.code).toBe('RECURRENCE_ACCOUNT_REQUIRED');
    expect(facade.canRetry()).toBe(false);
  });

  it('Dado o clique duplo, então uma requisição só', () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.realize$ = new Subject<ReturnType<typeof aRealized>>();
    const { facade } = setup(gateway);

    facade.realize('rec-1', '2026-10-10', null);
    facade.realize('rec-1', '2026-10-10', null);

    expect(gateway.realizations).toHaveLength(1);
    expect(facade.saving()).toBe(true);
  });

  it.each([
    ['rede', 0, 'NETWORK'],
    ['5xx', 503, 'INTERNAL_ERROR'],
    ['409 CONFLICT', 409, 'CONFLICT'],
  ])(
    'Dado falha ambígua (%s), então o "tentar de novo" reenvia com a MESMA chave',
    (_, status, code) => {
      const gateway = new RecurrencesGatewayStub();
      gateway.realize$ = failWith(status, code);
      const { facade } = setup(gateway);

      facade.realize('rec-1', '2026-10-10', '124.90');
      expect(facade.canRetry()).toBe(true);
      gateway.realize$ = null;
      facade.retry();

      expect(gateway.realizations).toHaveLength(2);
      expect(gateway.realizations[1]?.key).toBe(gateway.realizations[0]?.key);
    },
  );

  it('Dado falha ambígua, quando envio de novo os mesmos dados (ex.: reabri a folha), então reaproveita a chave', () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.realize$ = failWith(0, 'NETWORK');
    const { facade } = setup(gateway);
    facade.realize('rec-1', '2026-10-10', '124.90');

    facade.reopen('rec-1', '2026-10-10');
    expect(facade.canRetry()).toBe(true);
    facade.realize('rec-1', '2026-10-10', '124.90');

    expect(gateway.realizations[1]?.key).toBe(gateway.realizations[0]?.key);
  });

  it('Dado falha ambígua e dados diferentes (outro valor), então a chave é nova', () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.realize$ = failWith(0, 'NETWORK');
    const { facade } = setup(gateway);
    facade.realize('rec-1', '2026-10-10', '124.90');

    facade.realize('rec-1', '2026-10-10', '130.00');

    expect(gateway.realizations[1]?.key).not.toBe(gateway.realizations[0]?.key);
  });

  it('Dado recusa definitiva (422), então libera a chave e não oferece "tentar de novo"', () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.realize$ = failWith(422, 'RECURRENCE_OCCURRENCE_ALREADY_REALIZED');
    const { facade } = setup(gateway);

    facade.realize('rec-1', '2026-10-10', null);

    expect(facade.canRetry()).toBe(false);
    expect(facade.problem()).toMatchObject({ code: 'RECURRENCE_OCCURRENCE_ALREADY_REALIZED' });
    gateway.realize$ = null;
    facade.realize('rec-1', '2026-10-10', null);
    expect(gateway.realizations[1]?.key).not.toBe(gateway.realizations[0]?.key);
  });

  it('Dado reabrir para outra ocorrência, então descarta a falha pendente', () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.realize$ = failWith(0, 'NETWORK');
    const { facade } = setup(gateway);
    facade.realize('rec-1', '2026-10-10', null);

    facade.reopen('rec-1', '2026-11-10');

    expect(facade.problem()).toBeNull();
  });

  it('Dado sucesso, então a próxima realização usa chave nova', () => {
    const { facade, gateway } = setup();

    facade.realize('rec-1', '2026-10-10', null);
    facade.realize('rec-1', '2026-10-10', null);

    expect(gateway.realizations[1]?.key).not.toBe(gateway.realizations[0]?.key);
  });
});
