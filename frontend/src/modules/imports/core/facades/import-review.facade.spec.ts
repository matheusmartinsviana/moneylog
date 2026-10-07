import { TestBed } from '@angular/core/testing';

import { ImportReviewFacade } from '~/modules/imports/core/facades/import-review.facade';
import { aBatch, aLine, ImportsGatewayStub, provideImportsStub } from '~/testing/imports-testing';
import { aProblem } from '~/testing/notifications-testing';

async function setup(gateway = new ImportsGatewayStub()) {
  TestBed.configureTestingModule({ providers: [provideImportsStub(gateway), ImportReviewFacade] });
  const facade = TestBed.inject(ImportReviewFacade);
  facade.load('b-1');
  await vi.waitFor(() => expect(facade.loadStatus().status).toBe('ready'));
  return { gateway, facade };
}

describe('ImportReviewFacade', () => {
  it('Dado o lote, então expõe o lote e as linhas do backend', async () => {
    const { facade } = await setup();
    expect(facade.batch()?.id).toBe('b-1');
    expect(facade.lines()).toHaveLength(1);
    expect(facade.editable()).toBe(true);
  });

  it('Dado aceitar uma linha, então usa a linha devolvida e relê os contadores do backend', async () => {
    const { facade, gateway } = await setup();
    facade.review('l-1', { action: 'ACCEPT', categoryId: 'cat-food' });
    await vi.waitFor(() => expect(facade.busy()).toBeNull());

    expect(gateway.patches).toEqual([
      { lineId: 'l-1', patch: { action: 'ACCEPT', categoryId: 'cat-food' } },
    ]);
    expect(facade.lines()[0]?.status).toBe('ACCEPTED');
    expect(facade.batch()?.counts.accepted).toBe(1);
  });

  it('Dado "aceitar todas as sem decisão", então envia só as pendentes sem decisão (lines:bulk) e mostra o skipped', async () => {
    const gateway = new ImportsGatewayStub();
    gateway.lineList = [
      aLine({ id: 'a' }),
      aLine({ id: 'b', requiresDecision: true, flags: ['POSSIBLE_TRANSFER'] }),
      aLine({ id: 'c', status: 'REJECTED' }),
    ];
    gateway.bulkResult = { updated: 1, skipped: [{ lineId: 'x', reason: 'NO_CATEGORY' }] };
    const { facade } = await setup(gateway);

    facade.acceptAllWithoutDecision();
    await vi.waitFor(() => expect(facade.busy()).toBeNull());

    expect(gateway.bulkCalls).toEqual([{ ids: ['a'], action: 'ACCEPT' }]);
    expect(facade.bulkResult()?.skipped).toEqual([{ lineId: 'x', reason: 'NO_CATEGORY' }]);
  });

  it('Dado aplicar, então usa Idempotency-Key e guarda o que o backend criou', async () => {
    const { facade, gateway } = await setup();
    facade.applyBatch();
    await vi.waitFor(() => expect(facade.busy()).toBeNull());

    expect(gateway.applyKeys).toHaveLength(1);
    expect(gateway.applyKeys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(facade.created()).toEqual(['tx-1', 'tx-2']);
    expect(facade.batch()?.status).toBe('APPLIED');
    expect(facade.editable()).toBe(false);
  });

  it('Dado uma falha de rede no aplicar, então o "tentar de novo" reaproveita a mesma chave', async () => {
    const gateway = new ImportsGatewayStub();
    gateway.applyError = aProblem(0, 'NETWORK');
    const { facade } = await setup(gateway);

    facade.applyBatch();
    await vi.waitFor(() => expect(facade.problem()?.code).toBe('NETWORK'));
    gateway.applyError = null;
    facade.applyBatch();
    await vi.waitFor(() => expect(facade.created()).not.toBeNull());

    expect(gateway.applyKeys).toHaveLength(2);
    expect(gateway.applyKeys[0]).toBe(gateway.applyKeys[1]);
  });

  it('Dado IMPORT_LINES_REQUIRE_DECISION, então mostra o problema e recarrega o lote do backend', async () => {
    const gateway = new ImportsGatewayStub();
    gateway.applyError = aProblem(422, 'IMPORT_LINES_REQUIRE_DECISION');
    const { facade } = await setup(gateway);
    const before = gateway.calls.filter((c) => c.startsWith('get:')).length;

    facade.applyBatch();
    await vi.waitFor(() => expect(facade.problem()?.code).toBe('IMPORT_LINES_REQUIRE_DECISION'));
    await vi.waitFor(() =>
      expect(gateway.calls.filter((c) => c.startsWith('get:')).length).toBeGreaterThan(before),
    );
  });

  it('Dado desfazer parcial, então guarda os bloqueados com o código', async () => {
    const gateway = new ImportsGatewayStub();
    gateway.batch = aBatch({ status: 'APPLIED' });
    gateway.undoResult = {
      batch: aBatch({ status: 'PARTIALLY_UNDONE' }),
      blocked: [{ transactionId: 'tx-9', code: 'INVOICE_CLOSED', message: 'fatura fechada' }],
    };
    const { facade } = await setup(gateway);

    facade.undoBatch('errei o arquivo');
    await vi.waitFor(() => expect(facade.busy()).toBeNull());

    expect(gateway.calls).toContain('undo:errei o arquivo');
    expect(facade.batch()?.status).toBe('PARTIALLY_UNDONE');
    expect(facade.blocked().map((b) => b.transactionId)).toEqual(['tx-9']);
  });

  it('Dado um lote já aplicado, então não aceita decisões', async () => {
    const gateway = new ImportsGatewayStub();
    gateway.batch = aBatch({ status: 'APPLIED' });
    const { facade } = await setup(gateway);
    facade.review('l-1', { action: 'ACCEPT', categoryId: 'c' });
    facade.applyBatch();
    expect(gateway.patches).toEqual([]);
    expect(gateway.applyKeys).toEqual([]);
  });

  it('Dado muitas linhas, então "carregar mais" pagina de 50 em 50', async () => {
    const gateway = new ImportsGatewayStub();
    gateway.lineList = Array.from({ length: 120 }, (_, i) =>
      aLine({ id: `l-${i}`, position: i + 1 }),
    );
    const { facade } = await setup(gateway);
    expect(facade.lines()).toHaveLength(50);
    expect(facade.hasMore()).toBe(true);

    facade.loadMore();
    await vi.waitFor(() => expect(facade.lines()).toHaveLength(100));
    facade.loadMore();
    await vi.waitFor(() => expect(facade.lines()).toHaveLength(120));
    expect(facade.hasMore()).toBe(false);
  });

  it('Dado descartar o lote, então chama o DELETE e marca descartado', async () => {
    const { facade, gateway } = await setup();
    facade.discardBatch();
    await vi.waitFor(() => expect(facade.discarded()).toBe(true));
    expect(gateway.calls).toContain('discard:b-1');
  });

  it('Dado descartar com o lote já aplicado (422), então mostra o erro e não marca descartado', async () => {
    const gateway = new ImportsGatewayStub();
    gateway.discardError = aProblem(422, 'IMPORT_BATCH_NOT_PENDING');
    const { facade } = await setup(gateway);
    facade.discardBatch();
    await vi.waitFor(() => expect(facade.problem()?.code).toBe('IMPORT_BATCH_NOT_PENDING'));
    expect(facade.discarded()).toBe(false);
  });

  it('Dado desfazer a decisão de uma linha aceita, então envia REOPEN', async () => {
    const gateway = new ImportsGatewayStub();
    gateway.lineList = [aLine({ status: 'ACCEPTED' })];
    const { facade } = await setup(gateway);
    facade.review('l-1', { action: 'REOPEN' });
    await vi.waitFor(() => expect(facade.busy()).toBeNull());
    expect(gateway.patches).toEqual([{ lineId: 'l-1', patch: { action: 'REOPEN' } }]);
    expect(facade.lines()[0]?.status).toBe('PENDING');
  });

  it('Dado a outra ponta da transferência já lançada (422), então guarda a linha em conflito', async () => {
    const gateway = new ImportsGatewayStub();
    gateway.patchError = aProblem(422, 'IMPORT_TRANSFER_LEG_ALREADY_RECORDED');
    const { facade } = await setup(gateway);
    facade.review('l-1', { action: 'ACCEPT', asTransferTo: 'acc-2' });
    await vi.waitFor(() => expect(facade.legConflictLineId()).toBe('l-1'));
    expect(facade.problem()?.code).toBe('IMPORT_TRANSFER_LEG_ALREADY_RECORDED');
  });

  it('Dado IMPORT_APPLY_FAILED com causa, então expõe posição e causa e rejeita a linha aceita', async () => {
    const gateway = new ImportsGatewayStub();
    gateway.lineList = [aLine({ id: 'l-7', position: 7, status: 'ACCEPTED' })];
    gateway.applyError = {
      ...aProblem(422, 'IMPORT_APPLY_FAILED'),
      detail: 'linha 7: IMPORT_LINE_ALREADY_RECORDED',
    };
    const { facade } = await setup(gateway);
    facade.applyBatch();
    await vi.waitFor(() =>
      expect(facade.applyFailure()).toEqual({
        position: 7,
        cause: 'IMPORT_LINE_ALREADY_RECORDED',
      }),
    );
    await vi.waitFor(() => expect(facade.busy()).toBeNull());

    facade.rejectAcceptedAt(7);
    await vi.waitFor(() => expect(gateway.patches).toHaveLength(1));
    expect(gateway.patches[0]).toEqual({ lineId: 'l-7', patch: { action: 'REJECT' } });
  });

  it('Dado IMPORT_APPLY_FAILED com position e cause do contrato, então os usa sem ler o detail', async () => {
    const gateway = new ImportsGatewayStub();
    gateway.applyError = {
      ...aProblem(422, 'IMPORT_APPLY_FAILED'),
      position: 3,
      cause: 'IMPORT_TRANSFER_LEG_ALREADY_RECORDED',
      detail: 'linha 9: IMPORT_LINE_ALREADY_RECORDED',
    };
    const { facade } = await setup(gateway);
    facade.applyBatch();
    await vi.waitFor(() =>
      expect(facade.applyFailure()).toEqual({
        position: 3,
        cause: 'IMPORT_TRANSFER_LEG_ALREADY_RECORDED',
      }),
    );
  });

  it('Dado IMPORT_APPLY_FAILED com cause desconhecida e sem position, então vira OTHER e posição nula', async () => {
    const gateway = new ImportsGatewayStub();
    gateway.applyError = {
      ...aProblem(422, 'IMPORT_APPLY_FAILED'),
      cause: 'SOMETHING_NEW',
      detail: 'IMPORT_LINE_ALREADY_RECORDED',
    };
    const { facade } = await setup(gateway);
    facade.applyBatch();
    await vi.waitFor(() =>
      expect(facade.applyFailure()).toEqual({ position: null, cause: 'OTHER' }),
    );
  });
});
