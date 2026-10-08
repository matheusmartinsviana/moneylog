import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { CommitmentDetailFacade } from '~/modules/commitments/core/facades/commitment-detail.facade';
import { CommitmentFormFacade } from '~/modules/commitments/core/facades/commitment-form.facade';
import { CommitmentsListFacade } from '~/modules/commitments/core/facades/commitments-list.facade';
import { failWith } from '~/testing/accounts-testing';
import {
  aProject,
  CommitmentsGatewayStub,
  provideCommitmentsStub,
} from '~/testing/commitments-testing';

function setup(stub = new CommitmentsGatewayStub()) {
  TestBed.configureTestingModule({
    providers: [
      provideCommitmentsStub(stub),
      CommitmentsListFacade,
      CommitmentDetailFacade,
      CommitmentFormFacade,
    ],
  });
  return { stub };
}

describe('CommitmentsListFacade', () => {
  it('Dado compromissos, então a lista fica pronta na ordem do servidor', () => {
    setup();
    const facade = TestBed.inject(CommitmentsListFacade);

    facade.load();

    expect(facade.state().status).toBe('ready');
    expect(facade.data()?.map((c) => c.id)).toEqual(['c-loan', 'c-project']);
  });

  it('Dado nenhum compromisso, então o estado é vazio', () => {
    const stub = new CommitmentsGatewayStub();
    stub.list$ = of({ items: [], hasNext: false });
    setup(stub);
    const facade = TestBed.inject(CommitmentsListFacade);

    facade.load();

    expect(facade.state().status).toBe('empty');
  });

  it('Dado falha, então o estado é erro tipado', () => {
    const stub = new CommitmentsGatewayStub();
    stub.list$ = failWith(0, 'NETWORK');
    setup(stub);
    const facade = TestBed.inject(CommitmentsListFacade);

    facade.load();

    expect(facade.error()).toMatchObject({ status: 0 });
  });
});

describe('CommitmentDetailFacade', () => {
  it('Dado um projeto, então o detalhe traz o cronograma e os valores calculados pelo servidor', () => {
    setup();
    const facade = TestBed.inject(CommitmentDetailFacade);

    facade.load('c-project');

    expect(facade.commitment()?.nominalBalance?.amount).toBe('90000.00');
    expect(facade.commitment()?.schedule).toHaveLength(3);
  });

  it('Dado empréstimo de terceiro, então não há saldo calculado', () => {
    setup();
    const facade = TestBed.inject(CommitmentDetailFacade);

    facade.load('c-loan');

    expect(facade.commitment()?.nominalBalance).toBeNull();
    expect(facade.commitment()?.total).toBeNull();
  });

  it('Dado compromisso inexistente, então o estado é não encontrado', () => {
    const stub = new CommitmentsGatewayStub();
    stub.get$ = failWith(404, 'COMMITMENT_NOT_FOUND');
    setup(stub);
    const facade = TestBed.inject(CommitmentDetailFacade);

    facade.load('nada');

    expect(facade.state().status).toBe('notFound');
  });

  it('Dado marcar parcela paga, então manda a data e a versão e adota o compromisso da resposta', () => {
    const { stub } = setup();
    const facade = TestBed.inject(CommitmentDetailFacade);
    facade.load('c-project');

    facade.payItem(2, '2026-10-07');

    expect(stub.pays).toEqual([{ id: 'c-project', position: 2, paidOn: '2026-10-07', version: 3 }]);
    expect(facade.commitment()?.version).toBe(4);
    expect(facade.busy()).toBe(false);
  });

  it('Dado item já pago, então mostra o motivo e relê o compromisso do backend', () => {
    const stub = new CommitmentsGatewayStub();
    const { stub: same } = setup(stub);
    const facade = TestBed.inject(CommitmentDetailFacade);
    facade.load('c-project');
    stub.pay$ = failWith(422, 'COMMITMENT_SCHEDULE_ITEM_ALREADY_PAID');
    stub.get$ = of(aProject({ version: 9 }));

    facade.payItem(2, '2026-10-07');

    expect(same.pays).toHaveLength(1);
    expect(facade.problem()?.code).toBe('COMMITMENT_SCHEDULE_ITEM_ALREADY_PAID');
    expect(facade.commitment()?.version).toBe(9);
  });

  it('Dado atualizar progresso, então manda a versão atual e adota a resposta', () => {
    const { stub } = setup();
    const facade = TestBed.inject(CommitmentDetailFacade);
    facade.load('c-loan');

    facade.updateProgress({
      installmentsPaid: 5,
      paidAmount: '500.00',
      nextDueDate: null,
      notes: null,
    });

    expect(stub.progresses[0]!.input).toMatchObject({ installmentsPaid: 5, version: 1 });
    expect(facade.commitment()?.installmentsPaid).toBe(5);
  });
});

describe('CommitmentFormFacade', () => {
  const input = {
    kind: 'TRACKED_THIRD_PARTY' as const,
    name: 'Empréstimo',
    counterparty: null,
    notes: null,
    installmentsTotal: 12,
    installmentsPaid: 0,
    paidAmount: null,
    nextDueDate: null,
    schedule: null,
  };

  it('Dado salvar, então cria com Idempotency-Key e avisa com o compromisso da resposta', () => {
    const { stub } = setup();
    const facade = TestBed.inject(CommitmentFormFacade);
    const saved: string[] = [];
    facade.saved$.subscribe((c) => saved.push(c.name));

    facade.save(input);

    expect(stub.creates).toHaveLength(1);
    expect(stub.creates[0]!.key).toMatch(/[0-9a-f-]{36}/);
    expect(saved).toEqual(['Empréstimo']);
  });

  it('Dado COMMITMENT_INVALID, então o erro fica tipado e nada é avisado', () => {
    const stub = new CommitmentsGatewayStub();
    stub.create$ = failWith(422, 'COMMITMENT_INVALID');
    setup(stub);
    const facade = TestBed.inject(CommitmentFormFacade);
    const saved: unknown[] = [];
    facade.saved$.subscribe((c) => saved.push(c));

    facade.save(input);

    expect(facade.problem()?.code).toBe('COMMITMENT_INVALID');
    expect(saved).toEqual([]);
  });
});
