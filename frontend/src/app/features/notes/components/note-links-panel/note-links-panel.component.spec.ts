import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { NoteLinksPanelComponent } from '~/app/features/notes/components/note-links-panel/note-links-panel.component';
import type { BacklinksState } from '~/modules/notes/core/facades/note-editor.facade';
import type { NoteLink } from '~/modules/notes/core/types/note';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { aNote, aWikilink, anExplicitLink } from '~/testing/notes-testing';

async function setup(
  links: readonly NoteLink[] = [],
  backlinks: BacklinksState = { status: 'ready', items: [] },
  extra: { readonly?: boolean } = {},
) {
  const events = {
    add: vi.fn(),
    remove: vi.fn(),
    create: vi.fn(),
    retry: vi.fn(),
  };
  const result = await render(NoteLinksPanelComponent, {
    inputs: { note: aNote({ links }), backlinks, readonly: extra.readonly ?? false },
    on: {
      addLink: events.add,
      removeLink: events.remove,
      createNote: events.create,
      retryBacklinks: events.retry,
    },
    providers: [provideI18nTesting('pt'), provideRouter([])],
  });
  return { ...result, events };
}

describe('NoteLinksPanelComponent', () => {
  it('Dado nenhum vínculo, então diz que a nota não está vinculada e oferece "Vincular"', async () => {
    const { events } = await setup();

    expect(screen.getByTestId('links-none')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('link-add'));

    expect(events.add).toHaveBeenCalled();
  });

  it('Dado o vínculo à compra do notebook, então mostra o tipo, o rótulo com link para a tela e permite remover', async () => {
    const link = anExplicitLink();
    const { events } = await setup([link]);

    const item = screen.getByTestId('link-0');
    expect(item).toHaveTextContent('Movimentação');
    expect(screen.getByTestId('link-open-0')).toHaveAttribute('href', '/transactions/tx-1');
    expect(screen.getByTestId('link-open-0')).toHaveTextContent('Notebook');
    const remove = screen.getByTestId('link-remove-0');
    expect(remove).toHaveAccessibleName('Remover vínculo com Notebook');
    await userEvent.click(remove);

    expect(events.remove).toHaveBeenCalledWith(link);
  });

  it('Dado transação estornada, então o vínculo continua e mostra "estornada"', async () => {
    await setup([
      anExplicitLink({ target: { id: 'tx-1', key: null, label: 'Notebook', status: 'VOIDED' } }),
    ]);

    expect(screen.getByTestId('link-0')).toBeInTheDocument();
    expect(screen.getByTestId('link-status-0')).toHaveTextContent(/estornada/i);
  });

  it.each([
    ['ARCHIVED', 'arquivada'],
    ['CANCELED', 'cancelada'],
    ['TRASHED', 'na lixeira'],
  ] as const)('Dado alvo %s, então diz "%s"', async (status, text) => {
    await setup([
      anExplicitLink({ type: 'GOAL', target: { id: 'g', key: null, label: 'Reserva', status } }),
    ]);

    expect(screen.getByTestId('link-status-0')).toHaveTextContent(new RegExp(text, 'i'));
  });

  it('Dado o resumo mensal de outubro, então leva ao resumo do mês', async () => {
    await setup([
      anExplicitLink({
        type: 'MONTHLY_SUMMARY',
        target: { id: null, key: '2026-10', label: '2026-10', status: null },
      }),
    ]);

    expect(screen.getByTestId('link-open-0')).toHaveAttribute('href', '/planning/summary/2026-10');
  });

  it('Dado vínculo pendente (de importação), então aparece "pendente" e avisa que sai ao trocar os vínculos', async () => {
    await setup([anExplicitLink({ state: 'PENDING', target: null, text: 'tx-antigo' })]);

    expect(screen.getByTestId('link-pending')).toHaveTextContent(/pendente/i);
    expect(screen.getByTestId('links-pending-hint')).toBeInTheDocument();
  });

  it('Dado links no texto, então o resolvido leva à nota e o pendente tem "Criar nota"', async () => {
    const { events } = await setup([
      aWikilink(),
      aWikilink({ text: 'Nota nova', state: 'PENDING', target: null }),
    ]);

    expect(screen.getByTestId('wikilink-open-0')).toHaveAttribute('href', '/notes/note-2');
    expect(screen.getByTestId('wikilink-pending-1')).toHaveTextContent(/pendente/i);
    await userEvent.click(screen.getByTestId('wikilink-create-1'));

    expect(events.create).toHaveBeenCalledWith('Nota nova');
  });

  it('Dado o mesmo [[link]] repetido no texto, então aparece uma vez', async () => {
    await setup([aWikilink(), aWikilink()]);

    expect(within(screen.getByTestId('links-text')).getAllByRole('listitem')).toHaveLength(1);
  });

  it('Dado backlinks, então lista a nota de origem com o trecho em texto puro', async () => {
    await setup([], {
      status: 'ready',
      items: [
        {
          noteId: 'n9',
          path: 'projetos/MG Tech.md',
          title: 'MG Tech',
          context: 'veja [[2026-10]] <b>x</b>',
        },
      ],
    });

    expect(screen.getByTestId('backlink-n9').querySelector('a')).toHaveAttribute(
      'href',
      '/notes/n9',
    );
    expect(screen.getByTestId('backlink-context-n9')).toHaveTextContent(
      'veja [[2026-10]] <b>x</b>',
    );
    expect(screen.getByTestId('backlink-n9').querySelector('b')).toBeNull();
  });

  it('Dado nenhum backlink, então diz que nenhuma nota aponta para esta', async () => {
    await setup();

    expect(screen.getByTestId('backlinks-none')).toBeInTheDocument();
  });

  it('Dado erro nos backlinks, então mostra "Tentar de novo"', async () => {
    const { events } = await setup([], {
      status: 'error',
      problem: {
        status: 500,
        code: 'INTERNAL_ERROR',
        fieldErrors: [],
        traceId: null,
        retryAfterSeconds: null,
      },
    });

    await userEvent.click(screen.getByTestId('backlinks-retry'));

    expect(events.retry).toHaveBeenCalled();
  });

  it('Dado carregando os backlinks, então mostra o esqueleto', async () => {
    await setup([], { status: 'loading' });

    expect(screen.getByTestId('backlinks-loading')).toBeInTheDocument();
  });

  it('Dado nota na lixeira, então não oferece vincular nem remover', async () => {
    await setup([anExplicitLink()], undefined, { readonly: true });

    expect(screen.queryByTestId('link-add')).not.toBeInTheDocument();
    expect(screen.queryByTestId('link-remove-0')).not.toBeInTheDocument();
  });

  it('Dado o painel completo, então o axe não aponta violações', async () => {
    const { container } = await setup(
      [
        anExplicitLink(),
        aWikilink(),
        aWikilink({ text: 'Pendente', state: 'PENDING', target: null }),
      ],
      { status: 'ready', items: [{ noteId: 'n9', path: 'a.md', title: 'A', context: 'trecho' }] },
    );

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
