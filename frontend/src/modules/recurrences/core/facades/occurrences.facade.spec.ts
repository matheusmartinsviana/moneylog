import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { OccurrencesFacade } from '~/modules/recurrences/core/facades/occurrences.facade';
import { RecurrencesListFacade } from '~/modules/recurrences/core/facades/recurrences-list.facade';
import { brl, failWith } from '~/testing/accounts-testing';
import {
  aRecurrence,
  anOccurrence,
  aSummary,
  provideRecurrencesStub,
  RecurrencesGatewayStub,
} from '~/testing/recurrences-testing';

function setup(gateway = new RecurrencesGatewayStub()) {
  TestBed.configureTestingModule({
    providers: [provideRecurrencesStub(gateway), OccurrencesFacade, RecurrencesListFacade],
  });
  return {
    gateway,
    occurrences: TestBed.inject(OccurrencesFacade),
    list: TestBed.inject(RecurrencesListFacade),
  };
}

describe('OccurrencesFacade', () => {
  it('Dado ocorrências, então pede só as pendentes, sem `from` (vencidas incluídas)', () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.occurrences = [
      anOccurrence({ date: '2026-09-10', overdue: true }),
      anOccurrence({ date: '2026-10-10' }),
    ];
    const { occurrences } = setup(gateway);

    occurrences.load();

    expect(gateway.occurrenceQueries[0]).toMatchObject({ status: 'PENDING', page: 1 });
    expect(gateway.occurrenceQueries[0]?.from).toBeUndefined();
    expect(occurrences.data()?.map((o) => o.overdue)).toEqual([true, false]);
  });

  it('Dado nenhuma pendente, então o estado é vazio', () => {
    const { occurrences } = setup();
    occurrences.load();
    expect(occurrences.state().status).toBe('empty');
  });

  it('Dado erro, então o estado é error', () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.occurrencesResult = failWith(500, 'INTERNAL_ERROR');
    const { occurrences } = setup(gateway);
    occurrences.load();
    expect(occurrences.error()).toMatchObject({ status: 500 });
  });

  it('Dado pular, então confirma pela resposta, tira a ocorrência da lista e emite skipped$', () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.occurrences = [anOccurrence(), anOccurrence({ date: '2026-11-10' })];
    const { occurrences } = setup(gateway);
    occurrences.load();
    const skipped: string[] = [];
    occurrences.skipped$.subscribe((o) => skipped.push(`${o.date}:${o.status}`));

    occurrences.skip('rec-1', '2026-10-10');

    expect(occurrences.data()?.map((o) => o.date)).toEqual(['2026-11-10']);
    expect(skipped).toEqual(['2026-10-10:SKIPPED']);
  });

  it('Dado o clique duplo em pular, então uma requisição só', () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.occurrences = [anOccurrence()];
    gateway.skip$ = new Subject<ReturnType<typeof anOccurrence>>();
    const { occurrences } = setup(gateway);
    occurrences.load();

    occurrences.skip('rec-1', '2026-10-10');
    occurrences.skip('rec-1', '2026-10-10');

    expect(gateway.calls.filter((c) => c.startsWith('skip'))).toHaveLength(1);
  });

  it('Dado RECURRENCE_OCCURRENCE_ALREADY_REALIZED ao pular, então guarda o problema e recarrega a lista', () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.occurrences = [anOccurrence()];
    const { occurrences } = setup(gateway);
    occurrences.load();
    gateway.skip$ = failWith(422, 'RECURRENCE_OCCURRENCE_ALREADY_REALIZED');
    gateway.occurrences = [];

    occurrences.skip('rec-1', '2026-10-10');

    expect(occurrences.problem()).toMatchObject({ code: 'RECURRENCE_OCCURRENCE_ALREADY_REALIZED' });
    expect(occurrences.state().status).toBe('empty');
  });

  it.each(['RECURRENCE_INACTIVE', 'RECURRENCE_ENDED'])(
    'Dado %s ao pular, então a lista é recarregada do backend',
    (code) => {
      const gateway = new RecurrencesGatewayStub();
      gateway.occurrences = [anOccurrence()];
      const { occurrences } = setup(gateway);
      occurrences.load();
      gateway.skip$ = failWith(422, code);
      gateway.occurrences = [];

      occurrences.skip('rec-1', '2026-10-10');

      expect(occurrences.problem()).toMatchObject({ code });
      expect(occurrences.state().status).toBe('empty');
    },
  );

  it('Dado overdueTruncated na resposta, então só expõe o aviso (nada é calculado)', () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.occurrences = [anOccurrence({ date: '2026-09-10', overdue: true })];
    gateway.overdueTruncated = true;
    const { occurrences } = setup(gateway);

    occurrences.load();

    expect(occurrences.overdueTruncated()).toBe(true);
    expect(occurrences.data()).toHaveLength(1);
  });

  it('Dado a carga seguinte sem truncar, então o aviso some', () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.occurrences = [anOccurrence({ overdue: true })];
    gateway.overdueTruncated = true;
    const { occurrences } = setup(gateway);
    occurrences.load();
    gateway.overdueTruncated = false;

    occurrences.reload();

    expect(occurrences.overdueTruncated()).toBe(false);
  });
});

describe('RecurrencesListFacade', () => {
  it('Dado a carga, então lista (todas) e resumo vêm do backend', () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.recurrences = [aRecurrence(), aRecurrence({ id: 'rec-2', active: false })];
    gateway.summary$ = new Subject<ReturnType<typeof aSummary>>();
    const { list } = setup(gateway);

    list.load();

    expect(list.data()).toHaveLength(2);
    expect(gateway.queries[0]?.active).toBeUndefined();
    expect(list.summary().status).toBe('loading');
  });

  it('Dado o resumo, então custo fixo e receita recorrente são os recebidos', () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.recurrences = [aRecurrence()];
    const { list } = setup(gateway);

    list.load();

    expect(list.summary()).toMatchObject({
      status: 'ready',
      data: { fixedCosts: { amount: '119.00' }, estimate: true },
    });
  });

  it('Dado falha no resumo, então a lista continua visível (estados independentes)', () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.recurrences = [aRecurrence()];
    gateway.summary$ = failWith(500, 'INTERNAL_ERROR');
    const { list } = setup(gateway);

    list.load();

    expect(list.summary().status).toBe('error');
    expect(list.data()).toHaveLength(1);
  });

  it('Dado desativar, então usa a recorrência da resposta e recarrega o resumo do backend', () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.recurrences = [aRecurrence()];
    const { list } = setup(gateway);
    list.load();
    gateway.calls.length = 0;

    list.deactivate('rec-1');

    expect(list.data()?.[0]).toMatchObject({ active: false, nextOccurrence: null });
    expect(list.data()?.[0]?.monthlyEstimate).toEqual(brl('0.00'));
    expect(gateway.calls).toEqual(['deactivate:rec-1', 'summary']);
  });

  it('Dado encerrar sem data, então manda null (hoje, do backend, não do relógio do aparelho)', () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.recurrences = [aRecurrence()];
    const { list } = setup(gateway);
    list.load();

    list.end('rec-1', null);

    expect(gateway.calls).toContain('end:rec-1:today');
  });

  it('Dado RECURRENCE_INVALID ao encerrar, então guarda o problema', () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.recurrences = [aRecurrence()];
    const { list } = setup(gateway);
    list.load();
    gateway.next = failWith(422, 'RECURRENCE_INVALID');

    list.end('rec-1', '2020-01-01');

    expect(list.problem()).toMatchObject({ code: 'RECURRENCE_INVALID' });
  });
});
