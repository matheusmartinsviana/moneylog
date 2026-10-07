import { TestBed } from '@angular/core/testing';
import { NEVER } from 'rxjs';

import { VaultFacade } from '~/modules/notes/core/facades/vault.facade';
import { failWith } from '~/testing/accounts-testing';
import { NotesGatewayStub, provideNotesStub, VaultGatewayStub } from '~/testing/notes-testing';

function setup(vault = new VaultGatewayStub()) {
  TestBed.configureTestingModule({
    providers: [provideNotesStub(new NotesGatewayStub(), vault), VaultFacade],
  });
  return { vault, facade: TestBed.inject(VaultFacade) };
}

const ZIP = new File(['zip'], 'vault.zip', { type: 'application/zip' });

describe('VaultFacade', () => {
  it('Dado exportar, então o arquivo sai em file$ com o nome do backend', () => {
    const { facade, vault } = setup();
    const names: string[] = [];
    facade.file$.subscribe((f) => names.push(f.filename));

    facade.exportVault();

    expect(vault.exports).toBe(1);
    expect(names).toEqual(['moneylog-vault-2026-10-05.zip']);
    expect(facade.exporting()).toBe(false);
  });

  it('Dado exportar em curso, então o clique seguinte é ignorado (exhaustMap)', () => {
    const vault = new VaultGatewayStub();
    vault.exportResult = NEVER;
    const { facade } = setup(vault);

    facade.exportVault();
    facade.exportVault();

    expect(vault.exports).toBe(1);
    expect(facade.exporting()).toBe(true);
  });

  it('Dado erro 429 ao exportar, então o problema traz o Retry-After e some ao limpar', () => {
    const vault = new VaultGatewayStub();
    vault.exportResult = failWith(429, 'TOO_MANY_ATTEMPTS');
    const { facade } = setup(vault);

    facade.exportVault();

    expect(facade.exportProblem()?.code).toBe('TOO_MANY_ATTEMPTS');
    facade.clearExportProblem();
    expect(facade.exportProblem()).toBeNull();
  });

  it('Dado importar, então envia o arquivo com o modo e entrega o relatório', () => {
    const { facade, vault } = setup();
    const reports: number[] = [];
    facade.imported$.subscribe((r) => reports.push(r.created));

    facade.importVault(ZIP, 'RENAME');

    expect(vault.imports).toEqual([{ file: ZIP, mode: 'RENAME' }]);
    expect(facade.importStatus()).toMatchObject({ status: 'done' });
    expect(reports).toEqual([2]);
  });

  it('Dado VAULT_IMPORT_INVALID, então é erro tipado e "tentar de novo" reenvia o mesmo arquivo e modo', () => {
    const vault = new VaultGatewayStub();
    vault.importResult = failWith(422, 'VAULT_IMPORT_INVALID');
    const { facade } = setup(vault);

    facade.importVault(ZIP, 'SKIP');
    expect(facade.importStatus()).toMatchObject({
      status: 'error',
      problem: { code: 'VAULT_IMPORT_INVALID' },
    });

    facade.retryImport();

    expect(vault.imports).toHaveLength(2);
    expect(vault.imports[1]).toEqual({ file: ZIP, mode: 'SKIP' });
  });

  it.each([
    [0, 'NETWORK'],
    [504, 'GATEWAY_TIMEOUT'],
    [500, 'INTERNAL_ERROR'],
  ])(
    'Dado RENAME e falha sem confirmação (%s), então o resultado é incerto e "tentar de novo" NÃO reenvia (F5)',
    (status, code) => {
      const vault = new VaultGatewayStub();
      vault.importResult = failWith(status, code);
      const { facade } = setup(vault);

      facade.importVault(ZIP, 'RENAME');
      facade.retryImport();

      expect(facade.importUncertain()).toBe(true);
      expect(vault.imports).toHaveLength(1);
    },
  );

  it('Dado SKIP (idempotente) e falha de rede, então não é incerto e o retry reenvia', () => {
    const vault = new VaultGatewayStub();
    vault.importResult = failWith(0, 'NETWORK');
    const { facade } = setup(vault);

    facade.importVault(ZIP, 'SKIP');
    facade.retryImport();

    expect(facade.importUncertain()).toBe(false);
    expect(vault.imports).toHaveLength(2);
  });

  it('Dado RENAME e recusa definitiva (422/429), então não é incerto', () => {
    const vault = new VaultGatewayStub();
    vault.importResult = failWith(429, 'TOO_MANY_ATTEMPTS');
    const { facade } = setup(vault);

    facade.importVault(ZIP, 'RENAME');

    expect(facade.importUncertain()).toBe(false);
  });

  it('Dado importar em curso, então outro pedido é ignorado', () => {
    const vault = new VaultGatewayStub();
    vault.importResult = NEVER;
    const { facade } = setup(vault);

    facade.importVault(ZIP, 'SKIP');
    facade.importVault(ZIP, 'SKIP');

    expect(vault.imports).toHaveLength(1);
    expect(facade.importing()).toBe(true);
  });

  it('Dado resetImport, então volta ao estado inicial', () => {
    const { facade } = setup();
    facade.importVault(ZIP, 'SKIP');

    facade.resetImport();

    expect(facade.importStatus()).toEqual({ status: 'idle' });
  });
});
