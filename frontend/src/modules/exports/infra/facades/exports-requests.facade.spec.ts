import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { ExportsGateway } from '~/modules/exports/core/interfaces/exports.gateway';
import { EXPORTS_ENDPOINTS } from '~/modules/exports/infra/endpoints';
import { provideExports } from '~/modules/exports/infra/exports.providers';
import { ExportsRequestsFacade } from '~/modules/exports/infra/facades/exports-requests.facade';
import { API_MOCKS } from '~/util/api-mocks';

function setup(useMocks: boolean) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_MOCKS, useValue: useMocks },
      provideExports(),
    ],
  });
  return { gateway: TestBed.inject(ExportsGateway), http: TestBed.inject(HttpTestingController) };
}

describe('ExportsRequestsFacade', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('Dado o bootstrap, então a porta é a facade de requisições', () => {
    const { gateway } = setup(true);
    expect(gateway).toBe(TestBed.inject(ExportsRequestsFacade));
  });

  it('Dado o mock, então devolve arquivos mínimos e fixos, sem requisição', async () => {
    const { gateway, http } = setup(true);

    const csv = await firstValueFrom(gateway.transactionsCsv({ from: null, to: null }));
    const backup = await firstValueFrom(gateway.backup());

    expect(csv.filename).toBe('moneylog-transactions.csv');
    expect(csv.blob.type).toContain('text/csv');
    expect(backup.filename).toBe('moneylog-backup.json');
    http.expectNone(() => true);
  });

  describe('em modo real', () => {
    it('Dado o CSV, então baixa como Blob por GET com o período e usa o nome do Content-Disposition', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(
        gateway.transactionsCsv({ from: '2026-10-01', to: '2026-10-31' }),
      );
      const req = http.expectOne((r) => r.url === EXPORTS_ENDPOINTS.transactionsCsv);
      expect(req.request.method).toBe('GET');
      expect(req.request.responseType).toBe('blob');
      expect(req.request.params.get('from')).toBe('2026-10-01');
      expect(req.request.params.get('to')).toBe('2026-10-31');
      // O token vai no header (interceptor), nunca na URL.
      expect(req.request.urlWithParams).not.toMatch(/token|access/i);
      req.flush(new Blob(['﻿data;tipo\r\n'], { type: 'text/csv' }), {
        headers: {
          'Content-Disposition':
            'attachment; filename="moneylog-transactions-2026-10-01_2026-10-31.csv"',
        },
      });

      const file = await result;
      expect(file.filename).toBe('moneylog-transactions-2026-10-01_2026-10-31.csv');
      expect(file.blob.size).toBeGreaterThan(0);
    });

    it('Dado o idioma da interface, então vai no Accept-Language (o cabeçalho do CSV segue o app)', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(
        gateway.transactionsCsv({ from: null, to: null, language: 'en' }),
      );
      const req = http.expectOne((r) => r.url === EXPORTS_ENDPOINTS.transactionsCsv);
      expect(req.request.headers.get('Accept-Language')).toBe('en');
      req.flush(new Blob(['x']));
      await result;
    });

    it('Dado es (sem cabeçalho de CSV próprio no backend), então envia pt, a verdade do que ele devolve', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(
        gateway.transactionsCsv({ from: null, to: null, language: 'es' }),
      );
      const req = http.expectOne((r) => r.url === EXPORTS_ENDPOINTS.transactionsCsv);
      expect(req.request.headers.get('Accept-Language')).toBe('pt');
      req.flush(new Blob(['x']));
      await result;
    });

    it('Dado um nome hostil no Content-Disposition, então usa o nome padrão', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.backup());
      http.expectOne(EXPORTS_ENDPOINTS.backup).flush(new Blob(['{}']), {
        headers: { 'Content-Disposition': 'attachment; filename="..\\..\\evil.exe"' },
      });

      expect((await result).filename).toBe('moneylog-backup.json');
    });

    it('Dado sem período, então não manda from nem to', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.transactionsCsv({ from: null, to: null }));
      const req = http.expectOne((r) => r.url === EXPORTS_ENDPOINTS.transactionsCsv);
      expect(req.request.params.keys()).toEqual([]);
      req.flush(new Blob(['x']));

      expect((await result).filename).toBe('moneylog-transactions.csv');
    });

    it('Dado o backup sem Content-Disposition, então usa o nome padrão', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.backup());
      http.expectOne(EXPORTS_ENDPOINTS.backup).flush(new Blob(['{}']));

      expect((await result).filename).toBe('moneylog-backup.json');
    });

    it('Dado erro com o Problem em Blob, então o code do contrato não se perde', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.backup());
      http.expectOne(EXPORTS_ENDPOINTS.backup).flush(
        new Blob([JSON.stringify({ status: 401, code: 'UNAUTHENTICATED' })], {
          type: 'application/problem+json',
        }),
        { status: 401, statusText: 'Unauthorized' },
      );

      await expect(result).rejects.toMatchObject({
        problem: { status: 401, code: 'UNAUTHENTICATED' },
      });
    });

    it('Dado falha de rede, então é NETWORK', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.backup());
      http.expectOne(EXPORTS_ENDPOINTS.backup).error(new ProgressEvent('error'));

      await expect(result).rejects.toMatchObject({ problem: { status: 0, code: 'NETWORK' } });
    });
  });
});
