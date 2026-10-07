import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { ImportUploadFacade } from '~/modules/imports/core/facades/import-upload.facade';
import type { ImportUploadEvent, ImportUploadInput } from '~/modules/imports/core/types/import';
import { aBatch, ImportsGatewayStub, provideImportsStub } from '~/testing/imports-testing';

const input = (): ImportUploadInput => ({
  file: new File(['a;b'], 'extrato.csv', { type: 'text/csv' }),
  source: { kind: 'account', id: 'acc-1' },
  format: null,
  mapping: null,
});

function setup() {
  const gateway = new ImportsGatewayStub();
  gateway.uploadStream = new Subject<ImportUploadEvent>();
  TestBed.configureTestingModule({ providers: [provideImportsStub(gateway), ImportUploadFacade] });
  return { gateway, facade: TestBed.inject(ImportUploadFacade), stream: gateway.uploadStream };
}

describe('ImportUploadFacade (T132 CA2, T133 CA5)', () => {
  it('Dado um envio, então mostra o progresso e, ao terminar, emite o lote do backend', async () => {
    const { facade, stream } = setup();
    const batches: string[] = [];
    facade.uploaded$.subscribe((b) => batches.push(b.id));

    facade.start(input());
    expect(facade.uploading()).toBe(true);
    stream.next({ kind: 'progress', percent: 40 });
    expect(facade.percent()).toBe(40);
    stream.next({ kind: 'done', batch: aBatch({ id: 'novo' }) });
    stream.complete();

    expect(batches).toEqual(['novo']);
    expect(facade.uploading()).toBe(false);
  });

  it('Dado clique duplo, então um envio só (exhaustMap)', () => {
    const { facade, gateway } = setup();
    facade.start(input());
    facade.start(input());
    expect(gateway.uploads).toHaveLength(1);
  });

  it('Dado cancelar, então a requisição é abortada e nada é emitido', () => {
    const { facade, gateway } = setup();
    const batches: string[] = [];
    facade.uploaded$.subscribe((b) => batches.push(b.id));
    facade.start(input());

    facade.cancel();

    expect(gateway.uploadUnsubscribed).toBe(1);
    expect(facade.cancelled()).toBe(true);
    expect(facade.uploading()).toBe(false);
    expect(batches).toEqual([]);
  });

  it('Dado falha ambígua (rede), então o "tentar de novo" reaproveita a Idempotency-Key', () => {
    const { facade, gateway, stream } = setup();
    facade.start(input());
    stream.error(
      new (class extends Error {
        constructor() {
          super('x');
        }
      })(),
    );
    gateway.uploadStream = new Subject<ImportUploadEvent>();
    facade.retry();
    expect(gateway.uploads).toHaveLength(2);
    expect(gateway.uploads[0]?.key).toBe(gateway.uploads[1]?.key);
  });
});
