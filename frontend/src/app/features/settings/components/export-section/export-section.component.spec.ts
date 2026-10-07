import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { Subject, throwError } from 'rxjs';

import { es as TRANSLATIONS_ES } from '~/app/common/i18n/translations/es';
import { pt } from '~/app/common/i18n/translations/pt';
import { FileDownloadService } from '~/app/common/services/file-download.service';
import { ToastService } from '~/app/common/services/toast.service';
import { ExportSectionComponent } from '~/app/features/settings/components/export-section/export-section.component';
import type { DownloadedFile } from '~/modules/exports/core/types/export';
import { failWith } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { ExportsGatewayStub, provideExportsStub } from '~/testing/etapa5-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { ProblemError } from '~/util/api/problem';

vi.setConfig({ testTimeout: 30_000 });

async function setup(gateway = new ExportsGatewayStub(), language: 'pt' | 'en' | 'es' = 'pt') {
  const revoked: string[] = [];
  let created = 0;
  URL.createObjectURL = vi.fn(() => `blob:test/${created++}`);
  URL.revokeObjectURL = vi.fn((url: string) => void revoked.push(url));
  const result = await render(ExportSectionComponent, {
    providers: [provideI18nTesting(language), provideExportsStub(gateway)],
  });
  const download = TestBed.inject(FileDownloadService);
  const save = vi.spyOn(download, 'save').mockImplementation(() => undefined);
  return { ...result, gateway, save, download, revoked, toast: TestBed.inject(ToastService) };
}

describe('ExportSectionComponent', () => {
  afterEach(() => vi.restoreAllMocks());

  it('Dado o período, quando exporto o CSV, então pede ao backend e entrega o arquivo com o nome dele', async () => {
    const { gateway, save, toast, fixture } = await setup();

    await userEvent.type(screen.getByTestId('export-from'), '01102026');
    await userEvent.type(screen.getByTestId('export-to'), '31102026');
    await userEvent.click(screen.getByTestId('export-csv-action'));
    await fixture.whenStable();

    expect(gateway.csvQueries).toEqual([{ from: '2026-10-01', to: '2026-10-31', language: 'pt' }]);
    // Baixar o conteúdo NÃO salva sozinho e NÃO diz "pronto": mostra "Arquivo pronto" com o botão Salvar.
    expect(save).not.toHaveBeenCalled();
    expect(toast.toasts()).toHaveLength(0);
    expect(screen.getByTestId('export-ready')).toHaveTextContent(pt.exports.ready.title);
    expect(screen.getByTestId('export-ready-name')).toHaveTextContent(
      'moneylog-transactions-2026-10-01_2026-10-31.csv',
    );

    await userEvent.click(screen.getByTestId('export-save'));

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        file: expect.objectContaining({
          filename: 'moneylog-transactions-2026-10-01_2026-10-31.csv',
        }),
      }),
    );
    expect(toast.toasts()[0]?.message).toContain('moneylog-transactions-2026-10-01_2026-10-31.csv');
  });

  it('Dado sem período, então exporta tudo (sem from nem to)', async () => {
    const { gateway, fixture } = await setup();

    await userEvent.click(screen.getByTestId('export-csv-action'));
    await fixture.whenStable();

    expect(gateway.csvQueries).toEqual([{ from: null, to: null, language: 'pt' }]);
  });

  it('Dado a data inicial depois da final, então avisa e não exporta', async () => {
    const { gateway } = await setup();

    await userEvent.type(screen.getByTestId('export-from'), '31102026');
    await userEvent.type(screen.getByTestId('export-to'), '01102026');
    await userEvent.click(screen.getByTestId('export-csv-action'));

    expect(screen.getByTestId('export-range-invalid')).toHaveTextContent(
      pt.exports.csv.rangeInvalid,
    );
    expect(gateway.csvQueries).toHaveLength(0);
  });

  it('Dado o backup, então baixa o JSON e mostra o aviso de privacidade', async () => {
    const { gateway, save, fixture } = await setup();

    expect(screen.getByTestId('export-backup-privacy')).toHaveTextContent(
      pt.exports.backup.privacy,
    );
    await userEvent.click(screen.getByTestId('export-backup-action'));
    await fixture.whenStable();

    expect(gateway.backups).toBe(1);
    expect(save).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId('export-save'));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        file: expect.objectContaining({ filename: 'moneylog-backup-2026-10-10.json' }),
      }),
    );
  });

  it('Dado um download em curso, então mostra o progresso e os dois botões ficam desabilitados (sem clique duplo)', async () => {
    const gateway = new ExportsGatewayStub();
    gateway.backup$ = new Subject<DownloadedFile>();
    await setup(gateway);

    await userEvent.click(screen.getByTestId('export-backup-action'));
    await userEvent.click(screen.getByTestId('export-backup-action'));

    expect(screen.getByTestId('export-progress')).toBeInTheDocument();
    expect(screen.getByTestId('export-backup-action')).toBeDisabled();
    expect(screen.getByTestId('export-csv-action')).toBeDisabled();
    expect(screen.getByTestId('export-backup-action')).toHaveAttribute('aria-busy', 'true');
    expect(gateway.backups).toBe(1);
  });

  it('Dado erro de rede, então mostra a mensagem com "tentar de novo", que repete o pedido', async () => {
    const gateway = new ExportsGatewayStub();
    gateway.csv$ = failWith(0, 'NETWORK');
    const { save, fixture } = await setup(gateway);

    await userEvent.click(screen.getByTestId('export-csv-action'));
    await fixture.whenStable();
    expect(screen.getByTestId('export-error')).toHaveTextContent(pt.errors.network);
    expect(save).not.toHaveBeenCalled();

    gateway.csv$ = null;
    await userEvent.click(screen.getByTestId('export-retry'));
    await fixture.whenStable();

    expect(gateway.csvQueries).toHaveLength(2);
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByTestId('export-ready')).toBeInTheDocument();
    expect(screen.queryByTestId('export-error')).not.toBeInTheDocument();
  });

  it('Dado 422 EXPORT_TOO_LARGE, então mostra a mensagem traduzida e não oferece "tentar de novo"', async () => {
    const gateway = new ExportsGatewayStub();
    gateway.csv$ = failWith(422, 'EXPORT_TOO_LARGE');
    const { fixture } = await setup(gateway);

    await userEvent.click(screen.getByTestId('export-csv-action'));
    await fixture.whenStable();

    expect(screen.getByTestId('export-error')).toHaveTextContent(
      pt.errors.codes['EXPORT_TOO_LARGE'] ?? '',
    );
    expect(screen.queryByTestId('export-retry')).not.toBeInTheDocument();
  });

  it('Dado 429 com Retry-After, então "tentar de novo" só libera depois do tempo informado', async () => {
    const gateway = new ExportsGatewayStub();
    gateway.backup$ = throwError(
      () =>
        new ProblemError({
          status: 429,
          code: 'TOO_MANY_ATTEMPTS',
          fieldErrors: [],
          traceId: null,
          retryAfterSeconds: 1,
        }),
    );
    const { fixture } = await setup(gateway);

    await userEvent.click(screen.getByTestId('export-backup-action'));
    await fixture.whenStable();

    expect(screen.getByTestId('export-error')).toHaveTextContent(
      pt.errors.codes['TOO_MANY_ATTEMPTS'] ?? '',
    );
    expect(screen.getByTestId('export-retry')).toBeDisabled();
    expect(screen.getByTestId('export-retry')).toHaveTextContent('Tentar de novo em 1 s');

    await vi.waitFor(() => expect(screen.getByTestId('export-retry')).toBeEnabled(), {
      timeout: 3000,
    });
    expect(screen.getByTestId('export-retry')).toHaveTextContent(pt.exports.retry);
  });

  it('Dado que o navegador suporta compartilhar, então Compartilhar aparece no "Arquivo pronto" e o toast só vem quando compartilha', async () => {
    const { download, fixture, toast } = await setup();
    vi.spyOn(download, 'canShare').mockReturnValue(true);
    const share = vi.spyOn(download, 'share').mockResolvedValueOnce(false).mockResolvedValue(true);
    expect(screen.queryByTestId('export-share')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('export-backup-action'));
    await fixture.whenStable();
    await userEvent.click(await screen.findByTestId('export-share'));

    expect(share).toHaveBeenCalledTimes(1);
    // O usuário cancelou a folha de compartilhamento: nada de "pronto".
    expect(toast.toasts()).toHaveLength(0);

    await userEvent.click(screen.getByTestId('export-share'));
    expect(toast.toasts()[0]?.message).toContain('moneylog-backup-2026-10-10.json');
  });

  it('Dado que o navegador não compartilha arquivos, então só há Salvar', async () => {
    const { download, fixture } = await setup();
    vi.spyOn(download, 'canShare').mockReturnValue(false);

    await userEvent.click(screen.getByTestId('export-backup-action'));
    await fixture.whenStable();

    expect(screen.getByTestId('export-save')).toBeInTheDocument();
    expect(screen.queryByTestId('export-share')).not.toBeInTheDocument();
  });

  it('Dado o arquivo pronto, então o ObjectURL é revogado ao fechar, ao chegar outro e ao sair da tela', async () => {
    const { fixture, revoked } = await setup();

    await userEvent.click(screen.getByTestId('export-backup-action'));
    await fixture.whenStable();
    expect(revoked).toEqual([]);
    await userEvent.click(screen.getByTestId('export-dismiss'));
    expect(revoked).toEqual(['blob:test/0']);
    expect(screen.queryByTestId('export-ready')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('export-backup-action'));
    await fixture.whenStable();
    await userEvent.click(screen.getByTestId('export-backup-action'));
    await fixture.whenStable();
    expect(revoked).toEqual(['blob:test/0', 'blob:test/1']);

    fixture.destroy();
    expect(revoked).toEqual(['blob:test/0', 'blob:test/1', 'blob:test/2']);
  });

  it('Dado o idioma sem cabeçalho de CSV próprio (es), então avisa que o cabeçalho sai em português', async () => {
    const { gateway, fixture } = await setup(new ExportsGatewayStub(), 'es');

    expect(screen.getByTestId('export-csv-header-note')).toHaveTextContent(
      TRANSLATIONS_ES.exports.csv.headerFallback,
    );
    await userEvent.click(screen.getByTestId('export-csv-action'));
    await fixture.whenStable();

    expect(gateway.csvQueries[0]?.language).toBe('es');
  });

  it('Dado pt ou en, então não há aviso de cabeçalho', async () => {
    await setup(new ExportsGatewayStub(), 'en');

    expect(screen.queryByTestId('export-csv-header-note')).not.toBeInTheDocument();
  });

  it('Dado o bloco, então não tem violações de acessibilidade', async () => {
    const { container } = await setup();

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
