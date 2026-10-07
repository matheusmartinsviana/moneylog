import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { ExportsFacade } from '~/modules/exports/core/facades/exports.facade';
import type { DownloadedFile } from '~/modules/exports/core/types/export';
import { failWith } from '~/testing/accounts-testing';
import { aFile, ExportsGatewayStub, provideExportsStub } from '~/testing/etapa5-testing';

function setup(gateway = new ExportsGatewayStub()) {
  TestBed.configureTestingModule({ providers: [provideExportsStub(gateway), ExportsFacade] });
  return { gateway, facade: TestBed.inject(ExportsFacade) };
}

describe('ExportsFacade', () => {
  it('Dado exportar o CSV, então o período vai para a porta e o arquivo sai em file$', () => {
    const { facade, gateway } = setup();
    const files: string[] = [];
    facade.file$.subscribe(({ kind, file }) => files.push(`${kind}:${file.filename}`));

    facade.exportCsv({ from: '2026-10-01', to: '2026-10-31' });

    expect(gateway.csvQueries).toEqual([{ from: '2026-10-01', to: '2026-10-31' }]);
    expect(files).toEqual(['csv:moneylog-transactions-2026-10-01_2026-10-31.csv']);
    expect(facade.busy()).toBe(false);
  });

  it('Dado o backup, então chama a porta e emite o arquivo', () => {
    const { facade, gateway } = setup();
    const kinds: string[] = [];
    facade.file$.subscribe(({ kind }) => kinds.push(kind));

    facade.exportBackup();

    expect(gateway.backups).toBe(1);
    expect(kinds).toEqual(['backup']);
  });

  it('Dado um download em curso, então o clique seguinte é ignorado e running diz qual é', () => {
    const gateway = new ExportsGatewayStub();
    gateway.backup$ = new Subject<DownloadedFile>();
    const { facade } = setup(gateway);

    facade.exportBackup();
    facade.exportBackup();
    facade.exportCsv({ from: null, to: null });

    expect(gateway.backups).toBe(1);
    expect(gateway.csvQueries).toHaveLength(0);
    expect(facade.running()).toBe('backup');
    expect(facade.busy()).toBe(true);
  });

  it('Dado falha, então guarda o problema com o tipo e o "tentar de novo" repete o comando', () => {
    const gateway = new ExportsGatewayStub();
    gateway.csv$ = failWith(0, 'NETWORK');
    const { facade } = setup(gateway);

    facade.exportCsv({ from: '2026-10-01', to: null });
    expect(facade.failure()).toMatchObject({ kind: 'csv', problem: { code: 'NETWORK' } });

    gateway.csv$ = null;
    facade.retry();
    expect(gateway.csvQueries).toHaveLength(2);
    expect(facade.failure()).toBeNull();
  });

  it('Dado clearProblem, então a falha some', () => {
    const gateway = new ExportsGatewayStub();
    gateway.backup$ = failWith(500, 'INTERNAL_ERROR');
    const { facade } = setup(gateway);
    facade.exportBackup();

    facade.clearProblem();

    expect(facade.failure()).toBeNull();
    expect(aFile().filename).toContain('.csv');
  });

  it('Dado retry sem comando anterior, então não faz nada', () => {
    const { facade, gateway } = setup();

    facade.retry();

    expect(gateway.backups).toBe(0);
  });
});
