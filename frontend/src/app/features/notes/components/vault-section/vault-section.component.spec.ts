import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NEVER } from 'rxjs';

import { FileDownloadService } from '~/app/common/services/file-download.service';
import { VaultSectionComponent } from '~/app/features/notes/components/vault-section/vault-section.component';
import { failWith } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { NotesGatewayStub, provideNotesStub, VaultGatewayStub } from '~/testing/notes-testing';

vi.setConfig({ testTimeout: 30_000 });

async function setup(vault = new VaultGatewayStub()) {
  const imported = vi.fn();
  const result = await render(VaultSectionComponent, {
    on: { imported },
    providers: [
      provideI18nTesting('pt'),
      provideRouter([]),
      provideNotesStub(new NotesGatewayStub(), vault),
    ],
  });
  return { ...result, vault, imported };
}

const zip = (size = 100, name = 'vault.zip') => new File([new Uint8Array(size)], name);

async function pickAndImport(file = zip()) {
  await userEvent.upload(screen.getByTestId('vault-file-native'), file);
  await userEvent.click(screen.getByTestId('vault-import-action'));
}

describe('VaultSectionComponent', () => {
  it('Dado a seção, então é honesta sobre o armazenamento: guardado no servidor, exporte uma cópia em Markdown', async () => {
    await setup();

    expect(screen.getByTestId('vault-storage')).toHaveTextContent(
      'Suas notas ficam guardadas no servidor do moneylog. Exporte quando quiser uma cópia em Markdown',
    );
  });

  describe('exportar', () => {
    it('Dado exportar, então baixa o zip e mostra "Arquivo pronto" com Salvar (no clique do usuário)', async () => {
      const { vault } = await setup();
      const download = vi
        .spyOn(FileDownloadService.prototype, 'save')
        .mockImplementation(() => undefined);
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

      await userEvent.click(screen.getByTestId('vault-export-action'));

      expect(vault.exports).toBe(1);
      expect(screen.getByTestId('vault-export-ready')).toHaveTextContent(
        'moneylog-vault-2026-10-05.zip',
      );
      expect(download).not.toHaveBeenCalled();
      await userEvent.click(screen.getByTestId('vault-export-save'));
      expect(download).toHaveBeenCalledTimes(1);
      await userEvent.click(screen.getByTestId('vault-export-dismiss'));
      expect(screen.queryByTestId('vault-export-ready')).not.toBeInTheDocument();
      vi.restoreAllMocks();
    });

    it('Dado exportar em curso, então o botão fica desabilitado e há indicador de progresso', async () => {
      const vault = new VaultGatewayStub();
      vault.exportResult = NEVER;
      await setup(vault);

      await userEvent.click(screen.getByTestId('vault-export-action'));

      expect(screen.getByTestId('vault-export-action')).toBeDisabled();
      expect(screen.getByTestId('vault-export-progress')).toHaveTextContent('Preparando o zip...');
    });

    it('Dado erro ao exportar, então mostra "tentar de novo" que repete o pedido', async () => {
      const vault = new VaultGatewayStub();
      vault.exportResult = failWith(500, 'INTERNAL_ERROR');
      await setup(vault);

      await userEvent.click(screen.getByTestId('vault-export-action'));
      expect(screen.getByTestId('vault-export-error')).toBeInTheDocument();
      vault.exportResult = null;
      await userEvent.click(screen.getByTestId('vault-export-retry'));

      expect(vault.exports).toBe(2);
      expect(screen.queryByTestId('vault-export-error')).not.toBeInTheDocument();
    });

    it('Dado 429 com Retry-After, então "tentar de novo" espera os segundos que o backend mandou', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        const vault = new VaultGatewayStub();
        vault.exportResult = failWith(429, 'TOO_MANY_ATTEMPTS', []) as never;
        const original = vault.export.bind(vault);
        vault.export = () => {
          const error = original();
          return error;
        };
        await setup(vault);
        await userEvent.click(screen.getByTestId('vault-export-action'));

        expect(screen.getByTestId('vault-export-error')).toHaveTextContent(/Muitas tentativas/);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('importar', () => {
    it('Dado o FilePicker, então o único input file é o escondido dentro dele e aceita .zip', async () => {
      const { container } = await setup();

      const inputs = container.querySelectorAll('input[type="file"]');
      expect(inputs).toHaveLength(1);
      expect(inputs[0]).toHaveAttribute('hidden');
      expect(inputs[0]?.closest('app-file-picker')).not.toBeNull();
      expect(inputs[0]).toHaveAttribute('accept', '.zip');
    });

    it('Dado nenhum arquivo, então "Importar" não abre confirmação nem envia', async () => {
      const { vault } = await setup();

      await userEvent.click(screen.getByTestId('vault-import-action'));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(vault.imports).toEqual([]);
    });

    it('Dado um zip e o modo, então pede confirmação clara (nada é sobrescrito) ANTES de enviar', async () => {
      const { vault } = await setup();

      await pickAndImport();

      expect(vault.imports).toEqual([]);
      const dialog = screen.getByRole('dialog', { name: 'Importar este arquivo?' });
      expect(dialog).toHaveTextContent('Notas que já existem não mudam');
      expect(dialog).toHaveTextContent('serão puladas');
    });

    it('Dado o modo "Criar com outro nome", então a confirmação explica o "nome (2)" e envia RENAME', async () => {
      const { vault } = await setup();
      await userEvent.upload(screen.getByTestId('vault-file-native'), zip(100, 'meu.zip'));
      await userEvent.click(screen.getByTestId('vault-mode-RENAME'));
      await userEvent.click(screen.getByTestId('vault-import-action'));

      expect(screen.getByRole('dialog')).toHaveTextContent('"nome (2)"');
      await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));

      expect(vault.imports).toHaveLength(1);
      expect(vault.imports[0]?.mode).toBe('RENAME');
      expect(vault.imports[0]?.file.name).toBe('meu.zip');
    });

    it('Dado cancelar a confirmação, então nada é enviado', async () => {
      const { vault } = await setup();
      await pickAndImport();

      await userEvent.click(screen.getByTestId('confirm-dialog-cancel'));

      expect(vault.imports).toEqual([]);
    });

    it('Dado o padrão, então o modo é SKIP (pular), o mais conservador', async () => {
      const { vault } = await setup();
      await pickAndImport();
      await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));

      expect(vault.imports[0]?.mode).toBe('SKIP');
    });

    it('Dado a importação, então mostra o relatório com o que foi criado, pulado, ignorado e avisado, e avisa a tela', async () => {
      const { imported } = await setup();
      await pickAndImport();
      await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));

      expect(screen.getByTestId('import-report')).toBeInTheDocument();
      expect(screen.getByTestId('import-created')).toHaveTextContent('2');
      expect(screen.getByTestId('import-ignored-list')).toHaveTextContent('foto.png');
      expect(screen.getByTestId('import-warnings-list')).toHaveTextContent('b.md');
      expect(imported).toHaveBeenCalledTimes(1);
      await userEvent.click(screen.getByTestId('import-done'));
      expect(screen.queryByTestId('import-report')).not.toBeInTheDocument();
      expect(screen.getByTestId('vault-import-action')).toBeInTheDocument();
    });

    it('Dado o envio em curso, então mostra o progresso e não deixa enviar de novo', async () => {
      const vault = new VaultGatewayStub();
      vault.importResult = NEVER;
      await setup(vault);
      await pickAndImport();
      await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));

      expect(screen.getByTestId('vault-import-progress')).toHaveTextContent('Importando...');
      expect(screen.getByTestId('vault-import-action')).toBeDisabled();
    });

    it.each([
      ['VAULT_IMPORT_INVALID', /não é um zip válido/],
      ['VAULT_IMPORT_TOO_LARGE', /passa dos limites/],
    ])(
      'Dado %s, então mensagem clara, nada foi importado e só "escolher outro arquivo" ajuda',
      async (code, message) => {
        const vault = new VaultGatewayStub();
        vault.importResult = failWith(422, code);
        await setup(vault);
        await pickAndImport();
        await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));

        expect(screen.getByTestId('vault-import-error')).toHaveTextContent(message);
        expect(screen.getByTestId('vault-import-error')).toHaveTextContent('Nada foi importado');
        expect(screen.queryByTestId('vault-import-retry')).not.toBeInTheDocument();
        await userEvent.click(screen.getByTestId('vault-import-reset'));
        expect(screen.queryByTestId('vault-import-error')).not.toBeInTheDocument();
      },
    );

    it('Dado erro de rede, então "tentar de novo" reenvia o mesmo arquivo e modo', async () => {
      const vault = new VaultGatewayStub();
      vault.importResult = failWith(0, 'NETWORK');
      await setup(vault);
      await pickAndImport();
      await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));
      vault.importResult = null;

      await userEvent.click(screen.getByTestId('vault-import-retry'));

      expect(vault.imports).toHaveLength(2);
      expect(vault.imports[1]?.file).toBe(vault.imports[0]?.file);
      expect(screen.getByTestId('import-report')).toBeInTheDocument();
    });

    it('Dado erro de rede em RENAME, então o resultado é incerto: sem "tentar de novo" e pede para conferir o vault (F5)', async () => {
      const vault = new VaultGatewayStub();
      vault.importResult = failWith(0, 'NETWORK');
      await setup(vault);
      await userEvent.upload(screen.getByTestId('vault-file-native'), zip(100, 'meu.zip'));
      await userEvent.click(screen.getByTestId('vault-mode-RENAME'));
      await userEvent.click(screen.getByTestId('vault-import-action'));
      await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));

      expect(screen.getByTestId('vault-import-uncertain')).toHaveTextContent(
        'Confira as notas antes de repetir',
      );
      expect(screen.queryByTestId('vault-import-retry')).not.toBeInTheDocument();
      expect(vault.imports).toHaveLength(1);
    });

    it('Dado 504 em RENAME, então também é incerto; já em SKIP o retry continua automático (idempotente)', async () => {
      const vault = new VaultGatewayStub();
      vault.importResult = failWith(504, 'GATEWAY_TIMEOUT');
      await setup(vault);
      await pickAndImport();
      await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));

      expect(screen.queryByTestId('vault-import-uncertain')).not.toBeInTheDocument();
      expect(screen.getByTestId('vault-import-retry')).toBeInTheDocument();
    });

    it('Dado 429 em RENAME, então é recusa definitiva (nada gravado) e o retry segue disponível', async () => {
      const vault = new VaultGatewayStub();
      vault.importResult = failWith(429, 'TOO_MANY_ATTEMPTS');
      await setup(vault);
      await userEvent.upload(screen.getByTestId('vault-file-native'), zip(100, 'meu.zip'));
      await userEvent.click(screen.getByTestId('vault-mode-RENAME'));
      await userEvent.click(screen.getByTestId('vault-import-action'));
      await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));

      expect(screen.queryByTestId('vault-import-uncertain')).not.toBeInTheDocument();
      expect(screen.getByTestId('vault-import-retry')).toBeInTheDocument();
    });

    it('Dado arquivo acima de 20 MB ou de outro tipo, então o FilePicker recusa antes de enviar', async () => {
      const user = userEvent.setup({ applyAccept: false });
      const { vault } = await setup();

      await user.upload(screen.getByTestId('vault-file-native'), zip(10, 'notas.rar'));
      expect(screen.getByTestId('vault-file-error')).toHaveTextContent('Escolha um arquivo .zip.');
      await user.upload(
        screen.getByTestId('vault-file-native'),
        new File([new Uint8Array(21 * 1024 * 1024)], 'grande.zip'),
      );
      expect(screen.getByTestId('vault-file-error')).toHaveTextContent('tamanho máximo de 20 MB');
      await userEvent.click(screen.getByTestId('vault-import-action'));

      expect(vault.imports).toEqual([]);
    });
  });

  it('Dado a seção, então o axe não aponta violações (vazia, com arquivo e com relatório)', async () => {
    const { container } = await setup();
    let violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);

    await userEvent.upload(screen.getByTestId('vault-file-native'), zip());
    violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);

    await userEvent.click(screen.getByTestId('vault-import-action'));
    await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
