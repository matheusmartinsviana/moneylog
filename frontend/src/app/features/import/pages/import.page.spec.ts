import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { Subject } from 'rxjs';

import { ImportReviewPage } from '~/app/features/import/pages/import-review.page';
import { ImportPage } from '~/app/features/import/pages/import.page';
import type { ImportUploadEvent } from '~/modules/imports/core/types/import';
import { AccountsGatewayStub, anAccount, provideAccountsStub } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { aCard, CardsGatewayStub, provideCardsStub } from '~/testing/cards-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { aBatch, ImportsGatewayStub, provideImportsStub } from '~/testing/imports-testing';
import { aProblem } from '~/testing/notifications-testing';

async function setup(gateway = new ImportsGatewayStub()) {
  const accounts = new AccountsGatewayStub();
  accounts.accounts = [anAccount({ id: 'acc-1', name: 'Nubank' })];
  const cards = new CardsGatewayStub();
  cards.cards = [aCard({ id: 'card-1', name: 'Roxinho' })];
  const result = await render(ImportPage, {
    routes: [{ path: 'import/:id', component: ImportReviewPage }],
    providers: [
      provideI18nTesting('pt'),
      provideImportsStub(gateway),
      provideAccountsStub(accounts),
      provideCardsStub(cards),
    ],
  });
  await result.fixture.whenStable();
  result.fixture.detectChanges();
  return { ...result, gateway };
}

const csv = () => new File(['data;descricao;valor\n05/10/2026;PADARIA;-24,50'], 'nubank.csv');

async function chooseSourceAndFile(file = csv()) {
  await userEvent.click(screen.getByTestId('import-source'));
  await userEvent.click(screen.getByTestId('import-source-option-acc-1'));
  await userEvent.upload(screen.getByTestId('import-file-native'), file);
}

describe('ImportPage (T133)', () => {
  it('Dado nenhuma importação, então mostra os formatos (CSV e OFX), que XLSX/PDF não existem e a privacidade', async () => {
    await setup();
    expect(screen.getByTestId('import-formats')).toHaveTextContent('CSV e OFX');
    expect(screen.getByTestId('import-formats')).toHaveTextContent(
      'XLSX e PDF ainda não são suportados',
    );
    expect(screen.getByTestId('import-privacy')).toHaveTextContent(
      'O arquivo não é guardado; só as linhas lidas.',
    );
    expect(screen.getByTestId('import-recent-empty')).toBeInTheDocument();
    expect(screen.getByTestId('import-send')).toBeEnabled();
  });

  it('Dado enviar sem conta e sem arquivo, então pede os dois e não envia', async () => {
    const { gateway } = await setup();
    await userEvent.click(screen.getByTestId('import-send'));
    expect(screen.getByTestId('import-source-required')).toBeInTheDocument();
    expect(screen.getByTestId('import-file-required')).toBeInTheDocument();
    expect(gateway.uploads).toEqual([]);
  });

  it('Dado um CSV, então mostra o editor de colunas; o mapeamento manual vai junto com o envio', async () => {
    const { gateway, fixture } = await setup();
    await chooseSourceAndFile();
    expect(screen.getByTestId('mapping-editor')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('mapping-manual'));
    await userEvent.click(screen.getByTestId('import-send'));
    await fixture.whenStable();

    expect(gateway.uploads).toHaveLength(1);
    const sent = gateway.uploads[0]!.input;
    expect(sent.source).toEqual({ kind: 'account', id: 'acc-1' });
    expect(sent.file.name).toBe('nubank.csv');
    expect(sent.mapping).toMatchObject({ date: 0, description: 1, amount: 2, hasHeader: true });
  });

  it('Dado um OFX, então não pede mapeamento', async () => {
    await setup();
    await chooseSourceAndFile(new File(['<OFX></OFX>'], 'inter.ofx'));
    expect(screen.queryByTestId('mapping-editor')).not.toBeInTheDocument();
    expect(screen.getByTestId('import-ofx-note')).toBeInTheDocument();
  });

  it('Dado o envio concluído, então abre a revisão do lote devolvido pelo backend', async () => {
    const gateway = new ImportsGatewayStub();
    gateway.batch = aBatch({ id: 'novo-lote' });
    const { fixture } = await setup(gateway);
    await chooseSourceAndFile();
    await userEvent.click(screen.getByTestId('import-send'));
    await fixture.whenStable();
    await vi.waitFor(() => expect(TestBed.inject(Location).path()).toBe('/import/novo-lote'));
  });

  it('Dado o envio em andamento, então mostra o progresso e o botão cancela a requisição', async () => {
    const gateway = new ImportsGatewayStub();
    gateway.uploadStream = new Subject<ImportUploadEvent>();
    const { fixture } = await setup(gateway);
    await chooseSourceAndFile();
    await userEvent.click(screen.getByTestId('import-send'));
    gateway.uploadStream.next({ kind: 'progress', percent: 35 });
    fixture.detectChanges();

    expect(screen.getByTestId('import-progress-text')).toHaveTextContent('35%');
    await userEvent.click(screen.getByTestId('import-cancel'));
    fixture.detectChanges();

    expect(gateway.uploadUnsubscribed).toBe(1);
    expect(screen.getByTestId('import-cancelled')).toHaveTextContent('Nada foi criado.');
  });

  it('Dado IMPORT_PARSE_FAILED, então mostra mensagem clara e que nada foi criado', async () => {
    const gateway = new ImportsGatewayStub();
    const failing = new Subject<ImportUploadEvent>();
    gateway.uploadStream = failing;
    const { fixture } = await setup(gateway);
    await chooseSourceAndFile();
    await userEvent.click(screen.getByTestId('import-send'));
    const { ProblemError } = await import('~/util/api/problem');
    failing.error(new ProblemError(aProblem(422, 'IMPORT_PARSE_FAILED')));
    fixture.detectChanges();

    expect(screen.getByTestId('import-error')).toHaveTextContent('Não foi possível ler o arquivo');
    expect(screen.getByTestId('import-error')).toHaveTextContent('Nada foi criado.');
  });

  it('Dado importações anteriores, então lista com a situação e o link para abrir', async () => {
    const gateway = new ImportsGatewayStub();
    gateway.batches = [aBatch({ id: 'old', status: 'APPLIED' })];
    await setup(gateway);
    expect(screen.getByTestId('import-recent-row')).toHaveTextContent('Aplicada');
    expect(screen.getByTestId('import-recent-open')).toHaveAttribute('href', '/import/old');
  });

  it('Dado a página, então o axe não aponta violações', async () => {
    const { container } = await setup();
    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
