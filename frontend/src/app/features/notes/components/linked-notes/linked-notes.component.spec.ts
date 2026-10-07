import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NEVER } from 'rxjs';

import { LinkedNotesComponent } from '~/app/features/notes/components/linked-notes/linked-notes.component';
import type { NoteLinkType, NoteTargetStatus } from '~/modules/notes/core/types/note';
import { failWith } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { aSummary, NotesGatewayStub, provideNotesStub } from '~/testing/notes-testing';

vi.setConfig({ testTimeout: 30_000 });

async function setup(
  inputs: Partial<{
    type: NoteLinkType;
    entityId: string;
    entityKey: string;
    label: string;
    status: NoteTargetStatus | null;
    monthly: boolean;
  }> = {},
  gateway = new NotesGatewayStub(),
) {
  const result = await render(LinkedNotesComponent, {
    inputs: { type: 'TRANSACTION', entityId: 'tx-1', label: 'Notebook', ...inputs },
    providers: [
      provideI18nTesting('pt'),
      provideRouter([{ path: '**', children: [] }]),
      provideNotesStub(gateway),
    ],
  });
  await result.fixture.whenStable();
  result.fixture.detectChanges();
  return { ...result, gateway };
}

describe('LinkedNotesComponent', () => {
  it('Dado a compra do notebook, então lista as notas ligadas (GET /v1/links com tipo e id)', async () => {
    const gateway = new NotesGatewayStub();
    gateway.linked = [
      aSummary({ id: 'n1', title: 'Revisão de outubro', path: 'reviews/2026-10.md' }),
    ];
    await setup({}, gateway);

    expect(gateway.linkedQueries[0]).toMatchObject({ type: 'TRANSACTION', id: 'tx-1' });
    expect(screen.getByTestId('linked-notes-block')).toHaveTextContent('Notas vinculadas');
    expect(screen.getByTestId('note-link-n1')).toHaveAttribute('href', '/notes/n1');
    expect(screen.getByTestId('linked-notes-list')).toHaveTextContent('Revisão de outubro');
  });

  it('Dado o resumo mensal de outubro, então pede por MONTHLY_SUMMARY + AAAA-MM e mostra o título da revisão mensal', async () => {
    const gateway = new NotesGatewayStub();
    gateway.linked = [aSummary({ id: 'n1', title: 'Revisão de outubro' })];
    await setup(
      { type: 'MONTHLY_SUMMARY', entityId: undefined, entityKey: '2026-10', monthly: true },
      gateway,
    );

    expect(gateway.linkedQueries[0]).toMatchObject({ type: 'MONTHLY_SUMMARY', key: '2026-10' });
    expect(gateway.linkedQueries[0]?.id).toBeUndefined();
    expect(screen.getByTestId('linked-notes-block')).toHaveTextContent(
      'Vinculada à revisão mensal',
    );
  });

  it('Dado transação estornada, então o bloco continua, com as notas, e mostra o estado', async () => {
    const gateway = new NotesGatewayStub();
    gateway.linked = [aSummary({ id: 'n1' })];
    await setup({ status: 'VOIDED' }, gateway);

    expect(screen.getByTestId('linked-notes-status')).toHaveTextContent(/estornada/i);
    expect(screen.getByTestId('linked-notes-list')).toBeInTheDocument();
  });

  it('Dado nenhuma nota, então mostra um estado vazio compacto e "Nova nota vinculada"', async () => {
    await setup();

    expect(screen.getByTestId('linked-notes-empty')).toHaveTextContent(
      'Nenhuma nota vinculada ainda.',
    );
    expect(screen.getByTestId('linked-notes-new')).toBeInTheDocument();
  });

  it('Dado carregando, então mostra o esqueleto com texto para leitor de tela', async () => {
    const gateway = new NotesGatewayStub();
    gateway.linkedResult = NEVER as never;
    await setup({}, gateway);

    expect(screen.getByTestId('linked-notes-loading')).toHaveTextContent(
      /Carregando notas vinculadas/,
    );
  });

  it('Dado erro, então mostra "tentar de novo" que recarrega', async () => {
    const gateway = new NotesGatewayStub();
    gateway.linkedResult = failWith(500, 'INTERNAL_ERROR');
    const { fixture } = await setup({}, gateway);
    expect(screen.getByTestId('error-state')).toBeInTheDocument();

    gateway.linkedResult = null;
    gateway.linked = [aSummary({ id: 'n1' })];
    await userEvent.click(screen.getByTestId('empty-state-action-retry'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(screen.getByTestId('note-row-n1')).toBeInTheDocument();
  });

  it('Dado "Nova nota vinculada", então a nota nasce com o vínculo ao registro e abre no editor', async () => {
    const gateway = new NotesGatewayStub();
    const { fixture } = await setup({ entityId: 'tx-9', label: 'MacBook Pro: 14"' }, gateway);

    await userEvent.click(screen.getByTestId('linked-notes-new'));
    expect(screen.getByTestId('new-note-name')).toHaveValue('Nota de MacBook Pro 14');
    await userEvent.click(screen.getByTestId('new-note-submit'));
    await fixture.whenStable();

    expect(gateway.creates[0]).toMatchObject({
      path: 'Nota de MacBook Pro 14.md',
      links: [{ type: 'TRANSACTION', id: 'tx-9' }],
    });
    expect(TestBed.inject(Router).url).toBe('/notes/note-new');
  });

  it('Dado o resumo mensal, então a nota nova leva o vínculo pela chave do mês', async () => {
    const gateway = new NotesGatewayStub();
    const { fixture } = await setup(
      {
        type: 'MONTHLY_SUMMARY',
        entityId: undefined,
        entityKey: '2026-10',
        label: 'outubro de 2026',
        monthly: true,
      },
      gateway,
    );

    await userEvent.click(screen.getByTestId('linked-notes-new'));
    await userEvent.click(screen.getByTestId('new-note-submit'));
    await fixture.whenStable();

    expect(gateway.creates[0]?.links).toEqual([{ type: 'MONTHLY_SUMMARY', key: '2026-10' }]);
  });

  it('Dado várias páginas, então "Mostrar mais" acrescenta', async () => {
    const gateway = new NotesGatewayStub();
    gateway.linked = Array.from({ length: 25 }, (_, i) =>
      aSummary({ id: `n${i}`, title: `Nota ${i}` }),
    );
    const { fixture } = await setup({}, gateway);

    await userEvent.click(screen.getByTestId('linked-notes-more'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(screen.getByTestId('note-row-n24')).toBeInTheDocument();
  });

  it('Dado o aviso, então diz que a nota nunca altera valores (o front não calcula nada financeiro)', async () => {
    await setup();

    expect(screen.getByTestId('linked-notes-block')).toHaveTextContent(
      'Uma nota nunca altera valores',
    );
  });

  it('Dado o bloco com notas, então o axe não aponta violações', async () => {
    const gateway = new NotesGatewayStub();
    gateway.linked = [aSummary({ id: 'n1' })];
    const { container } = await setup({}, gateway);

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
