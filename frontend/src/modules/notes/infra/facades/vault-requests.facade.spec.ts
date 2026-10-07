import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { VaultGateway } from '~/modules/notes/core/interfaces/vault.gateway';
import { NOTES_ENDPOINTS } from '~/modules/notes/infra/endpoints';
import { provideNotes } from '~/modules/notes/infra/notes.providers';
import { aReportResponse } from '~/testing/notes-testing';
import { API_MOCKS } from '~/util/api-mocks';

function setup(useMocks: boolean) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_MOCKS, useValue: useMocks },
      provideNotes(),
    ],
  });
  return { gateway: TestBed.inject(VaultGateway), http: TestBed.inject(HttpTestingController) };
}

describe('VaultRequestsFacade', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('Dado o mock, então exporta um zip e importa um relatório vazio, sem HTTP', async () => {
    const { gateway, http } = setup(true);

    const file = await firstValueFrom(gateway.export());
    expect(file.filename).toBe('moneylog-vault.zip');
    expect(file.blob.type).toBe('application/zip');
    const report = await firstValueFrom(gateway.import(new File(['x'], 'v.zip'), 'SKIP'));
    expect(report.created).toBe(0);
    http.expectNone(() => true);
  });

  it('Dado exportar, então baixa como Blob e usa o nome do Content-Disposition endurecido', async () => {
    const { gateway, http } = setup(false);
    const result = firstValueFrom(gateway.export());

    const req = http.expectOne(NOTES_ENDPOINTS.vaultExport);
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['zip']), {
      headers: new HttpHeaders({
        'Content-Disposition': 'attachment; filename="moneylog-vault-2026-10-05.zip"',
      }),
    });

    const file = await result;
    expect(file.filename).toBe('moneylog-vault-2026-10-05.zip');
    expect(file.blob.size).toBe(3);
  });

  it('Dado Content-Disposition suspeito, então cai no nome padrão', async () => {
    const { gateway, http } = setup(false);
    const result = firstValueFrom(gateway.export());

    http.expectOne(NOTES_ENDPOINTS.vaultExport).flush(new Blob(['z']), {
      headers: new HttpHeaders({ 'Content-Disposition': 'attachment; filename="../../x.exe"' }),
    });

    expect((await result).filename).toBe('moneylog-vault.zip');
  });

  it('Dado erro ao exportar, então o code do Blob de erro é preservado (429 e Retry-After)', async () => {
    const { gateway, http } = setup(false);
    const result = firstValueFrom(gateway.export());

    http.expectOne(NOTES_ENDPOINTS.vaultExport).flush(
      new Blob([JSON.stringify({ code: 'TOO_MANY_ATTEMPTS', status: 429 })], {
        type: 'application/json',
      }),
      {
        status: 429,
        statusText: 'Too Many Requests',
        headers: new HttpHeaders({ 'Retry-After': '30' }),
      },
    );

    await expect(result).rejects.toMatchObject({
      problem: { status: 429, code: 'TOO_MANY_ATTEMPTS', retryAfterSeconds: 30 },
    });
  });

  it('Dado importar, então multipart com o campo file e mode na QUERY', async () => {
    const { gateway, http } = setup(false);
    const file = new File(['zip'], 'vault.zip', { type: 'application/zip' });
    const result = firstValueFrom(gateway.import(file, 'RENAME'));

    const req = http.expectOne((r) => r.url === NOTES_ENDPOINTS.vaultImport);
    expect(req.request.method).toBe('POST');
    expect(req.request.params.get('mode')).toBe('RENAME');
    const body = req.request.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect((body.get('file') as File).name).toBe('vault.zip');
    expect(body.has('mode')).toBe(false);
    req.flush(aReportResponse());

    expect(await result).toMatchObject({
      created: 2,
      skipped: 1,
      pendingLinks: 1,
      renamedFiles: [{ from: 'b.md', to: 'b (2).md' }],
    });
  });

  it('Dado 413 do servidor (sem o corpo do contrato), então vira VAULT_IMPORT_TOO_LARGE', async () => {
    const { gateway, http } = setup(false);
    const result = firstValueFrom(gateway.import(new File(['x'], 'v.zip'), 'SKIP'));

    http
      .expectOne((r) => r.url === NOTES_ENDPOINTS.vaultImport)
      .flush('<html>Payload Too Large</html>', { status: 413, statusText: 'Payload Too Large' });

    await expect(result).rejects.toMatchObject({
      problem: { status: 413, code: 'VAULT_IMPORT_TOO_LARGE' },
    });
  });

  it('Dado 422 VAULT_IMPORT_TOO_LARGE, então vira ProblemError tipado', async () => {
    const { gateway, http } = setup(false);
    const result = firstValueFrom(gateway.import(new File(['x'], 'v.zip'), 'SKIP'));

    http
      .expectOne((r) => r.url === NOTES_ENDPOINTS.vaultImport)
      .flush(
        { code: 'VAULT_IMPORT_TOO_LARGE', status: 422 },
        { status: 422, statusText: 'Unprocessable Entity' },
      );

    await expect(result).rejects.toMatchObject({
      problem: { status: 422, code: 'VAULT_IMPORT_TOO_LARGE' },
    });
  });
});
