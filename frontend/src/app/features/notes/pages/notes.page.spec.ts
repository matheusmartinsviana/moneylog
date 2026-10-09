import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NEVER } from 'rxjs';

import { ViewportService } from '~/app/common/components/overlay/viewport.service';
import { pt } from '~/app/common/i18n/translations/pt';
import { NotesPage } from '~/app/features/notes/pages/notes.page';
import { failWith } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { aSummary, NotesGatewayStub, provideNotesStub } from '~/testing/notes-testing';

vi.setConfig({ testTimeout: 30_000 });

const NOTES = [
  aSummary({
    id: 'n1',
    path: 'reviews/2026-10.md',
    title: 'Revisão de outubro',
    tags: ['revisao'],
    snippet: 'Comprei o MacBook para o trabalho',
  }),
  aSummary({ id: 'n2', path: 'projetos/MG Tech.md', title: 'MG Tech', tags: ['trabalho'] }),
  aSummary({ id: 'n3', path: 'decisoes/reserva.md', title: 'Reserva', tags: [] }),
];

async function setup(gateway = new NotesGatewayStub(), compact = false) {
  const result = await render(NotesPage, {
    providers: [
      provideI18nTesting('pt'),
      provideRouter([{ path: '**', children: [] }]),
      provideNotesStub(gateway),
      { provide: ViewportService, useValue: { compact: () => compact } },
    ],
  });
  await result.fixture.whenStable();
  result.fixture.detectChanges();
  return { ...result, gateway };
}

describe('NotesPage', () => {
  it('Dado nenhuma nota, então o estado vazio do DS 01 oferece "Nova nota" e abre a folha de criação', async () => {
    await setup();

    expect(screen.getByTestId('empty-state-title')).toHaveTextContent(pt.emptyState.notes.title);
    await userEvent.click(screen.getByTestId('empty-state-action-create-note'));

    expect(screen.getByRole('dialog', { name: pt.notes.create.title })).toBeInTheDocument();
  });

  it('Dado mais notas que a árvore carrega de início, então avisa que as pastas são parciais e carrega mais sob demanda (F10)', async () => {
    const gateway = new NotesGatewayStub();
    gateway.notes = Array.from({ length: 1500 }, (_, i) =>
      aSummary({ id: `n${i}`, path: `pasta${i % 5}/nota${String(i).padStart(4, '0')}.md` }),
    );
    const { fixture } = await setup(gateway);

    expect(screen.getByTestId('notes-tree-partial')).toHaveTextContent(
      'As pastas mostram as primeiras 100 notas',
    );
    await userEvent.click(screen.getByTestId('notes-tree-more'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(screen.getByTestId('notes-tree-partial')).toHaveTextContent('as primeiras 300 notas');
  });

  it('Dado nenhuma nota, então "Importar pasta Markdown" está disponível e abre a importação com o FilePicker', async () => {
    await setup();

    const action = screen.getByTestId('empty-state-action-import-vault');
    expect(action).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByTestId('vault-section')).not.toBeInTheDocument();
    await userEvent.click(action);

    expect(screen.getByTestId('vault-section')).toBeInTheDocument();
    expect(screen.getByTestId('vault-file')).toBeInTheDocument();
  });

  it('Dado a importação concluída, então a lista, as pastas e as tags voltam do backend', async () => {
    const gateway = new NotesGatewayStub();
    const { fixture } = await setup(gateway);
    await userEvent.click(screen.getByTestId('empty-state-action-import-vault'));
    gateway.notes = NOTES;

    await userEvent.upload(
      screen.getByTestId('vault-file-native'),
      new File([new Uint8Array(10)], 'vault.zip'),
    );
    await userEvent.click(screen.getByTestId('vault-import-action'));
    await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(screen.getByTestId('import-report')).toBeInTheDocument();
    expect(screen.getByTestId('note-row-n1')).toBeInTheDocument();
  });

  it('Dado a tela, então diz com honestidade onde as notas ficam guardadas', async () => {
    await setup();

    // O aviso mora em "Mais" (junto do cofre), recolhido por padrão.
    await userEvent.click(screen.getByTestId('notes-vault-toggle'));
    expect(screen.getByTestId('notes-storage')).toHaveTextContent(
      'Guardado no servidor do moneylog. Exporte quando quiser uma cópia em Markdown.',
    );
  });

  it('Dado a carga, então mostra o esqueleto com texto para leitor de tela', async () => {
    const gateway = new NotesGatewayStub();
    gateway.listError = NEVER as never;
    await setup(gateway);

    expect(screen.getByTestId('notes-loading')).toHaveTextContent(pt.notes.list.loading);
  });

  it('Dado notas, então a lista mostra título, caminho, tags e data, com link para o editor', async () => {
    const gateway = new NotesGatewayStub();
    gateway.notes = NOTES;
    await setup(gateway);

    const row = screen.getByTestId('note-row-n1');
    expect(within(row).getByText('Revisão de outubro')).toBeInTheDocument();
    expect(within(row).getByText('reviews/2026-10.md')).toBeInTheDocument();
    expect(within(row).getByText('#revisao')).toBeInTheDocument();
    expect(row).toHaveTextContent(/Atualizada em 5 de outubro de 2026/);
    expect(screen.getByTestId('note-link-n1')).toHaveAttribute('href', '/notes/n1');
  });

  it('Dado a árvore, então tem role="tree" com as pastas derivadas dos caminhos e a contagem', async () => {
    const gateway = new NotesGatewayStub();
    gateway.notes = NOTES;
    await setup(gateway);

    const tree = screen.getByRole('tree', { name: pt.notes.list.treeLabel });
    expect(
      within(tree)
        .getAllByRole('treeitem')
        .map((i) => i.getAttribute('data-cy')),
    ).toEqual(['folder-all', 'folder-decisoes', 'folder-projetos', 'folder-reviews']);
    expect(screen.getByTestId('folder-all')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('folder-projetos')).toHaveAttribute(
      'aria-label',
      'projetos, 1 notas',
    );
  });

  it('Dado clicar numa pasta, então filtra pelo backend e a pasta vai para a URL', async () => {
    const gateway = new NotesGatewayStub();
    gateway.notes = NOTES;
    const { fixture } = await setup(gateway);

    await userEvent.click(screen.getByTestId('folder-projetos'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(gateway.queries.at(-1)).toMatchObject({ folder: 'projetos', status: 'ACTIVE' });
    expect(screen.queryByTestId('note-row-n1')).not.toBeInTheDocument();
    expect(screen.getByTestId('note-row-n2')).toBeInTheDocument();
    expect(TestBed.inject(Router).url).toContain('folder=projetos');
    expect(screen.getByTestId('folder-projetos')).toHaveAttribute('aria-selected', 'true');
  });

  it('Dado o teclado na árvore, então setas andam, Enter escolhe e → abre a pasta', async () => {
    const gateway = new NotesGatewayStub();
    gateway.notes = [
      aSummary({ id: 'a', path: 'projetos/clientes/x.md', title: 'x' }),
      aSummary({ id: 'b', path: 'projetos/y.md', title: 'y' }),
    ];
    const { fixture } = await setup(gateway);

    screen.getByTestId('folder-all').focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByTestId('folder-projetos')).toHaveFocus();
    expect(screen.queryByTestId('folder-projetos/clientes')).not.toBeInTheDocument();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByTestId('folder-projetos')).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByTestId('folder-projetos/clientes')).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByTestId('folder-projetos')).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await fixture.whenStable();

    expect(gateway.queries.at(-1)?.folder).toBe('projetos');
    await userEvent.keyboard('{End}');
    expect(screen.getByTestId('folder-projetos/clientes')).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(screen.getByTestId('folder-all')).toHaveFocus();
  });

  it('Dado 375 px, então a árvore vira um seletor de pasta', async () => {
    const gateway = new NotesGatewayStub();
    gateway.notes = NOTES;
    await setup(gateway, true);

    expect(screen.queryByRole('tree')).not.toBeInTheDocument();
    expect(screen.getByTestId('notes-folder-select')).toBeInTheDocument();
  });

  it('Dado a busca, então espera 300 ms, destaca o termo e o leva para a URL', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const gateway = new NotesGatewayStub();
      gateway.notes = NOTES;
      const { fixture } = await setup(gateway);
      gateway.queries.length = 0;

      await userEvent.type(screen.getByTestId('notes-search'), 'macbook');
      await vi.advanceTimersByTimeAsync(400);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(gateway.queries).toHaveLength(1);
      expect(gateway.queries[0]?.q).toBe('macbook');
      expect(TestBed.inject(Router).url).toContain('q=macbook');
    } finally {
      vi.useRealTimers();
    }
  });

  it('Dado o trecho da busca, então o termo aparece marcado em texto puro (sem HTML)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const gateway = new NotesGatewayStub();
      gateway.notes = [
        aSummary({
          id: 'x',
          title: 'MacBook Pro',
          path: 'r.md',
          snippet: 'Comprei o MacBook <script>alert(1)</script>',
        }),
      ];
      const { fixture } = await setup(gateway);
      await userEvent.type(screen.getByTestId('notes-search'), 'macbook');
      await vi.advanceTimersByTimeAsync(400);
      await fixture.whenStable();
      fixture.detectChanges();

      const snippet = screen.getByTestId('note-snippet-x');
      expect(snippet.querySelector('mark')).toHaveTextContent('MacBook');
      expect(snippet.querySelector('script')).toBeNull();
      expect(snippet).toHaveTextContent('<script>alert(1)</script>');
    } finally {
      vi.useRealTimers();
    }
  });

  it('Dado as tags, então o chip filtra por tag e a contagem vem do backend', async () => {
    const gateway = new NotesGatewayStub();
    gateway.notes = NOTES;
    gateway.tagList = [
      { tag: 'trabalho', count: 4 },
      { tag: 'revisao', count: 1 },
    ];
    const { fixture } = await setup(gateway);

    const chip = screen.getByTestId('tag-chip-trabalho');
    expect(chip).toHaveTextContent('4');
    await userEvent.click(chip);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(gateway.queries.at(-1)?.tag).toBe('trabalho');
    expect(screen.getByTestId('tag-chip-trabalho')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByTestId('tag-chip-trabalho'));
    await fixture.whenStable();
    expect(gateway.queries.at(-1)?.tag).toBeUndefined();
  });

  it('Dado filtro sem resultado, então diz que nada foi encontrado e "Limpar filtros" volta à lista', async () => {
    const gateway = new NotesGatewayStub();
    gateway.notes = NOTES;
    gateway.tagList = [{ tag: 'vazia', count: 0 }];
    const { fixture } = await setup(gateway);

    await userEvent.click(screen.getByTestId('tag-chip-vazia'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(screen.getByTestId('empty-state-title')).toHaveTextContent(
      pt.notes.list.noResults.title,
    );
    await userEvent.click(screen.getByTestId('empty-state-action-clear-filters'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(screen.getByTestId('note-row-n1')).toBeInTheDocument();
  });

  it('Dado mais de uma página, então "Mostrar mais notas" acrescenta a próxima', async () => {
    const gateway = new NotesGatewayStub();
    gateway.notes = Array.from({ length: 55 }, (_, i) =>
      aSummary({ id: `n${i}`, path: `n${i}.md`, title: `Nota ${i}` }),
    );
    const { fixture } = await setup(gateway);
    expect(screen.queryByTestId('note-row-n54')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('notes-load-more'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(screen.getByTestId('note-row-n54')).toBeInTheDocument();
    expect(screen.queryByTestId('notes-load-more')).not.toBeInTheDocument();
  });

  it('Dado erro ao carregar, então mostra "tentar de novo" que recarrega', async () => {
    const gateway = new NotesGatewayStub();
    gateway.listError = failWith(500, 'INTERNAL_ERROR');
    const { fixture } = await setup(gateway);
    expect(screen.getByTestId('error-state')).toBeInTheDocument();

    gateway.listError = null;
    gateway.notes = NOTES;
    await userEvent.click(screen.getByTestId('empty-state-action-retry'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(screen.getByTestId('note-row-n1')).toBeInTheDocument();
  });

  describe('lixeira', () => {
    async function trashSetup() {
      const gateway = new NotesGatewayStub();
      gateway.notes = NOTES;
      gateway.trashed = [
        aSummary({
          id: 't1',
          title: 'Rascunho',
          path: 'rascunho.md',
          trashedAt: '2026-10-04T10:00:00Z',
        }),
      ];
      const result = await setup(gateway);
      await userEvent.click(screen.getByTestId('notes-tab-trash'));
      await result.fixture.whenStable();
      result.fixture.detectChanges();
      return { ...result, gateway };
    }

    it('Dado a aba Lixeira, então lista as notas apagadas com a data e o aviso de que nada some em silêncio', async () => {
      const { gateway } = await trashSetup();

      expect(gateway.queries.at(-1)?.status).toBe('TRASHED');
      expect(screen.getByTestId('trash-row-t1')).toHaveTextContent('Rascunho');
      expect(screen.getByTestId('trash-row-t1')).toHaveTextContent('Na lixeira desde');
      expect(screen.getByTestId('notes-trash')).toHaveTextContent(pt.notes.trash.description);
    });

    it('Dado "Restaurar", então chama o backend, a nota sai da lixeira e avisa', async () => {
      const { gateway, fixture } = await trashSetup();

      await userEvent.click(screen.getByTestId('trash-restore-t1'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(gateway.calls).toContain('restore:t1');
      expect(screen.queryByTestId('trash-row-t1')).not.toBeInTheDocument();
      expect(screen.getByTestId('notes-trash-empty')).toHaveTextContent(pt.notes.trash.empty);
    });

    it('Dado restaurar com o caminho ocupado, então a nota fica e o motivo aparece', async () => {
      const { gateway, fixture } = await trashSetup();
      gateway.next = failWith(422, 'NOTE_PATH_TAKEN');

      await userEvent.click(screen.getByTestId('trash-restore-t1'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(screen.getByTestId('trash-row-t1')).toBeInTheDocument();
      expect(screen.getByTestId('notes-action-error')).toHaveTextContent(/Já existe uma nota/);
    });

    it('Dado "Esvaziar lixeira", então pede confirmação explícita antes de apagar de vez', async () => {
      const { gateway, fixture } = await trashSetup();

      await userEvent.click(screen.getByTestId('notes-empty-trash'));
      expect(gateway.calls).not.toContain('emptyTrash');
      expect(
        screen.getByRole('dialog', { name: pt.notes.trash.emptyConfirm.title }),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByTestId('confirm-dialog-cancel'));
      expect(gateway.calls).not.toContain('emptyTrash');

      await userEvent.click(screen.getByTestId('notes-empty-trash'));
      await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(gateway.calls).toContain('emptyTrash');
      expect(screen.getByTestId('notes-trash-empty')).toBeInTheDocument();
    });
  });

  it('Dado a tela com notas, então o axe não aponta violações', async () => {
    const gateway = new NotesGatewayStub();
    gateway.notes = NOTES;
    gateway.tagList = [{ tag: 'trabalho', count: 4 }];
    const { container } = await setup(gateway);

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it('Dado o estado vazio, então o axe não aponta violações', async () => {
    const { container } = await setup();

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
