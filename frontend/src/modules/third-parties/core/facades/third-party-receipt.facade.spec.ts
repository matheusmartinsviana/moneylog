import { TestBed } from '@angular/core/testing';

import { ThirdPartyReceiptFacade } from '~/modules/third-parties/core/facades/third-party-receipt.facade';
import { failWith } from '~/testing/accounts-testing';
import { provideThirdPartiesStub, ThirdPartiesGatewayStub } from '~/testing/third-parties-testing';

function setup(stub = new ThirdPartiesGatewayStub()) {
  TestBed.configureTestingModule({
    providers: [provideThirdPartiesStub(stub), ThirdPartyReceiptFacade],
  });
  return { stub, facade: TestBed.inject(ThirdPartyReceiptFacade) };
}

const input = {
  personId: 'person-1',
  transactionId: null,
  amount: '50.00',
  receivedOn: '2026-10-05',
  note: null,
};

describe('ThirdPartyReceiptFacade', () => {
  it('Dado um recebimento, então envia com Idempotency-Key e avisa com a resposta do backend', () => {
    const { stub, facade } = setup();
    const recorded: string[] = [];
    facade.recorded$.subscribe((receipt) => recorded.push(receipt.id));

    facade.record(input);

    expect(stub.receipts).toHaveLength(1);
    expect(stub.receipts[0]!.key).not.toBe('');
    expect(recorded).toEqual(['rcp-1']);
    expect(facade.saving()).toBe(false);
  });

  it('Dado falha ambígua e o mesmo envio, então reusa a chave', () => {
    const stub = new ThirdPartiesGatewayStub();
    stub.recordReceipt$ = failWith(500, 'INTERNAL');
    const { facade } = setup(stub);

    facade.record(input);
    facade.record(input);

    expect(stub.receipts[0]!.key).toBe(stub.receipts[1]!.key);
    expect(facade.problem()?.status).toBe(500);
  });

  it('Dado 422, então expõe o code tipado', () => {
    const stub = new ThirdPartiesGatewayStub();
    stub.recordReceipt$ = failWith(422, 'PERSON_ARCHIVED');
    const { facade } = setup(stub);

    facade.record(input);

    expect(facade.problem()?.code).toBe('PERSON_ARCHIVED');
  });

  it('Dado remover, então chama o DELETE e avisa o id removido', () => {
    const { stub, facade } = setup();
    const removed: string[] = [];
    facade.removed$.subscribe((id) => removed.push(id));

    facade.remove('rcp-9');

    expect(stub.deletes).toEqual(['rcp-9']);
    expect(removed).toEqual(['rcp-9']);
  });

  it('Dado falha ao remover, então não avisa e expõe o problema', () => {
    const stub = new ThirdPartiesGatewayStub();
    stub.deleteReceipt$ = failWith(404, 'NOT_FOUND');
    const { facade } = setup(stub);
    const removed: string[] = [];
    facade.removed$.subscribe((id) => removed.push(id));

    facade.remove('rcp-9');

    expect(removed).toEqual([]);
    expect(facade.problem()?.status).toBe(404);
  });
});
