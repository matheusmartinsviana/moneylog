import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';

import { ViewportService } from '~/app/common/components/overlay/viewport.service';
import { pt } from '~/app/common/i18n/translations/pt';
import {
  DRAFT_DEBOUNCE_MS,
  NotePage,
  PREVIEW_DEBOUNCE_MS,
} from '~/app/features/notes/pages/note.page';
import { failWith } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideCardsStub } from '~/testing/cards-testing';
import { provideDebtsStub } from '~/testing/debts-testing';
import { provideGoalsStub } from '~/testing/goals-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { provideFakeMarkdownWorker } from '~/testing/markdown-worker-testing';
import {
  aNote,
  anExplicitLink,
  aWikilink,
  NotesGatewayStub,
  provideNotesStub,
} from '~/testing/notes-testing';
import { providePeopleStub } from '~/testing/people-testing';
import { provideTransactionsStub } from '~/testing/transactions-testing';

vi.setConfig({ testTimeout: 30_000 });

async function setup(gateway = new NotesGatewayStub(), compact = false) {
  const result = await render(NotePage, {
    inputs: { id: 'note-1' },
    providers: [
      provideI18nTesting('pt'),
      provideRouter([{ path: '**', children: [] }]),
      // O seletor de vínculos busca nas portas de outros módulos.
      provideTransactionsStub(),
      providePeopleStub(),
      provideGoalsStub(),
      provideDebtsStub(),
      provideCardsStub(),
      provideNotesStub(gateway),
      // jsdom não tem Worker: o executor do Markdown é o parser real num worker falso (FE-S-198).
      provideFakeMarkdownWorker(),
      { provide: ViewportService, useValue: { compact: () => compact } },
    ],
  });
  await result.fixture.whenStable();
  result.fixture.detectChanges();
  return { ...result, gateway };
}

const area = () => screen.getByTestId('note-text') as HTMLTextAreaElement;

async function type(text: string) {
  await userEvent.click(area());
  await userEvent.type(area(), text);
}

describe('NotePage', () => {
  describe('carregar', () => {
    it('Dado a nota, então mostra o título como h1, o caminho, a indicação de armazenamento, o texto e a pré-visualização', async () => {
      await setup();

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2026-10');
      expect(screen.getByTestId('note-path')).toHaveTextContent('reviews/2026-10.md');
      expect(screen.getByTestId('note-storage')).toHaveTextContent(
        'Notas armazenadas no servidor do moneylog.',
      );
      expect(area()).toHaveValue(aNote().body);
      expect(screen.getByTestId('note-preview')).toHaveTextContent('Revisão de outubro');
      expect(screen.getByTestId('note-tags')).toHaveTextContent('#revisao');
      expect(screen.getByTestId('note-status')).toHaveTextContent('Tudo salvo');
    });

    it('Dado título e caminho com RLO, então o título (h1) e o caminho mostram marcas visíveis (F7)', async () => {
      const rlo = '\u{202e}';
      const gateway = new NotesGatewayStub();
      gateway.getResult = of(aNote({ title: `fatura${rlo}fdp`, path: `a/b${rlo}.md` }));
      await setup(gateway);

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('fatura‹U+202E›fdp');
      expect(screen.getByRole('heading', { level: 1 }).textContent).not.toContain(rlo);
      expect(screen.getByTestId('note-path').textContent).not.toContain(rlo);
      expect(screen.getByTestId('note-path').querySelector('bdi')).not.toBeNull();
    });

    it('Dado nota que não existe (404), então mostra "Nota não encontrada" com volta às notas', async () => {
      const gateway = new NotesGatewayStub();
      gateway.getResult = failWith(404, 'NOTE_NOT_FOUND');
      await setup(gateway);

      expect(screen.getByTestId('empty-state-title')).toHaveTextContent(
        pt.notes.editor.notFound.title,
      );
      expect(screen.getByTestId('empty-state-action-back')).toHaveAttribute('href', '/notes');
    });

    it('Dado falha ao carregar, então "tentar de novo" recarrega', async () => {
      const gateway = new NotesGatewayStub();
      gateway.getResult = failWith(500, 'INTERNAL_ERROR');
      const { fixture } = await setup(gateway);
      expect(screen.getByTestId('error-state')).toBeInTheDocument();

      gateway.getResult = null;
      await userEvent.click(screen.getByTestId('empty-state-action-retry'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(area()).toHaveValue(aNote().body);
    });
  });

  describe('editar e pré-visualizar', () => {
    it('Dado digitar, então a pré-visualização espera 300 ms e usa o renderizador seguro; nenhum HTML bruto executa', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        const { fixture } = await setup();

        await userEvent.click(area());
        await userEvent.clear(area());
        await userEvent.paste('# Novo\n\n<script>alert(1)</script> e <img src=x onerror=alert(1)>');
        expect(screen.getByTestId('note-preview')).not.toHaveTextContent('Novo');
        await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS + 50);
        fixture.detectChanges();

        const preview = screen.getByTestId('note-preview');
        expect(preview).toHaveTextContent('Novo');
        expect(preview.querySelector('script')).toBeNull();
        expect(preview.querySelector('img')).toBeNull();
        expect(preview).toHaveTextContent('<script>alert(1)</script>');
      } finally {
        vi.useRealTimers();
      }
    });

    it('Dado nota com payload XSS no corpo, então nada executa ao abrir', async () => {
      const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
      const gateway = new NotesGatewayStub();
      gateway.getResult = of(
        aNote({
          body: '[x](javascript:alert(1))\n\n<iframe src="javascript:alert(1)"></iframe>\n\n![x](http://evil/x.png)',
        }),
      );
      await setup(gateway);

      const preview = screen.getByTestId('note-preview');
      expect(preview.querySelector('iframe, img, script')).toBeNull();
      expect(preview.querySelector('a')).toBeNull();
      expect(alert).not.toHaveBeenCalled();
      alert.mockRestore();
    });

    it('Dado links do backend, então o wikilink resolvido navega e o pendente oferece criar a nota', async () => {
      const gateway = new NotesGatewayStub();
      gateway.getResult = of(
        aNote({
          body: 'Veja [[MacBook]] e [[projetos/Nova]].',
          links: [
            aWikilink(),
            aWikilink({ text: 'projetos/Nova', state: 'PENDING', target: null }),
          ],
        }),
      );
      await setup(gateway);

      expect(screen.getByTestId('md-wikilink')).toHaveAttribute('href', '/notes/note-2');
      await userEvent.click(screen.getByTestId('md-wikilink-pending'));

      expect(screen.getByTestId('new-note-name')).toHaveValue('Nova');
      expect(screen.getByTestId('new-note-folder')).toHaveValue('projetos');
    });

    it('Dado alterações, então o estado vira "Alterações não salvas"', async () => {
      await setup();

      await type(' mais');

      expect(screen.getByTestId('note-status')).toHaveTextContent('Alterações não salvas');
    });
  });

  describe('salvar', () => {
    it('Dado salvar, então envia a version, a resposta vira o estado e avisa', async () => {
      const { gateway, fixture } = await setup();
      await type(' mais');

      await userEvent.click(screen.getByTestId('note-save'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(gateway.updates).toEqual([{ id: 'note-1', body: `${aNote().body} mais`, version: 3 }]);
      expect(screen.getByTestId('note-status')).toHaveTextContent('Tudo salvo');
    });

    it('Dado Ctrl+S no editor, então salva uma vez só', async () => {
      const { gateway } = await setup();
      await type(' x');

      await userEvent.keyboard('{Control>}s{/Control}');

      expect(gateway.updates).toHaveLength(1);
    });

    it('Dado Cmd+S fora do editor (no botão), então também salva', async () => {
      const { gateway } = await setup();
      await type(' x');
      screen.getByTestId('note-save').focus();

      await userEvent.keyboard('{Meta>}s{/Meta}');

      expect(gateway.updates).toHaveLength(1);
    });

    it('Dado nada alterado, então salvar não envia nada', async () => {
      const { gateway } = await setup();

      await userEvent.click(screen.getByTestId('note-save'));

      expect(gateway.updates).toEqual([]);
    });

    it('Dado NOTE_TOO_LARGE do backend, então o motivo aparece e o texto continua no editor', async () => {
      const gateway = new NotesGatewayStub();
      const { fixture } = await setup(gateway);
      await type(' mais');
      gateway.updateQueue.push(failWith(422, 'NOTE_TOO_LARGE'));

      await userEvent.click(screen.getByTestId('note-save'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(screen.getByTestId('note-error')).toHaveTextContent(/limite de 200 KB/);
      expect(area()).toHaveValue(`${aNote().body} mais`);
    });

    it('Dado texto acima de 200 KB, então avisa na hora e não deixa salvar', async () => {
      const { gateway } = await setup();
      await userEvent.click(area());
      await userEvent.clear(area());
      await userEvent.paste('a'.repeat(204_801));

      expect(screen.getByTestId('editor-too-large')).toBeInTheDocument();
      expect(screen.getByTestId('note-save')).toHaveAttribute('aria-disabled', 'true');
      await userEvent.click(screen.getByTestId('note-save'));
      expect(gateway.updates).toEqual([]);
    });
  });

  describe('detalhes de edição (🟢)', () => {
    it('Dado nota com quebras de linha CRLF (zip do Windows), então abre como "Tudo salvo" e continua assim sem editar', async () => {
      const gateway = new NotesGatewayStub();
      gateway.getResult = of(aNote({ body: 'linha 1\r\nlinha 2\r\n' }));
      await setup(gateway);

      expect(screen.getByTestId('note-status')).toHaveTextContent('Tudo salvo');
      await userEvent.click(area());
      await userEvent.keyboard('x{Backspace}');
      expect(screen.getByTestId('note-status')).toHaveTextContent('Tudo salvo');
    });

    it('Dado duas navegações com o diálogo "Sair sem salvar?" aberto, então a primeira promessa resolve com false (não fica pendente)', async () => {
      const { fixture } = await setup();
      await type(' x');
      const page = fixture.componentInstance;

      const first = page.confirmLeave();
      const second = page.confirmLeave();

      await expect(first).resolves.toBe(false);
      expect(second).toBeInstanceOf(Promise);
    });
  });

  describe('rascunho local contra perda (🟢)', () => {
    const key = 'moneylog:note-draft:note-1';

    it('Dado texto não salvo, então o rascunho vai para o sessionStorage (com a versão) e some ao salvar', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        const gateway = new NotesGatewayStub();
        const { fixture } = await setup(gateway);
        await type(' meu rascunho');
        await vi.advanceTimersByTimeAsync(DRAFT_DEBOUNCE_MS + 50);

        expect(JSON.parse(window.sessionStorage.getItem(key) ?? 'null')).toEqual({
          body: `${aNote().body} meu rascunho`,
          version: 3,
        });

        await userEvent.click(screen.getByTestId('note-save'));
        await fixture.whenStable();
        expect(window.sessionStorage.getItem(key)).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('Dado um rascunho da mesma versão ao abrir, então restaura o texto e avisa, com "Descartar"', async () => {
      window.sessionStorage.setItem(
        key,
        JSON.stringify({ body: 'texto que eu tinha', version: 3 }),
      );
      await setup();

      expect(area()).toHaveValue('texto que eu tinha');
      expect(screen.getByTestId('note-draft-recovered')).toBeInTheDocument();
      expect(screen.getByTestId('note-status')).toHaveTextContent('Alterações não salvas');

      await userEvent.click(screen.getByTestId('note-draft-discard'));

      expect(area()).toHaveValue(aNote().body);
      expect(screen.queryByTestId('note-draft-recovered')).not.toBeInTheDocument();
      expect(window.sessionStorage.getItem(key)).toBeNull();
    });

    it('Dado um rascunho de OUTRA versão (a nota mudou em outro lugar), então NÃO restaura (salvar sobrescreveria a edição alheia)', async () => {
      window.sessionStorage.setItem(key, JSON.stringify({ body: 'antigo', version: 2 }));
      await setup();

      expect(area()).toHaveValue(aNote().body);
      expect(screen.queryByTestId('note-draft-recovered')).not.toBeInTheDocument();
      expect(window.sessionStorage.getItem(key)).toBeNull();
    });

    it('Dado sessionStorage indisponível, então o editor funciona igual', async () => {
      const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('bloqueado');
      });
      try {
        await setup();
        expect(area()).toHaveValue(aNote().body);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('VERSION_CONFLICT', () => {
    async function conflictSetup() {
      const gateway = new NotesGatewayStub();
      const result = await setup(gateway);
      await type(' meu texto');
      gateway.updateQueue.push(failWith(409, 'VERSION_CONFLICT'));
      gateway.getResult = of(aNote({ version: 7, body: 'texto do servidor\nlinha 2' }));
      await userEvent.click(screen.getByTestId('note-save'));
      await result.fixture.whenStable();
      result.fixture.detectChanges();
      return { ...result, gateway };
    }

    it('Dado conflito, então NÃO sobrescreve: o texto digitado fica e o painel oferece as duas escolhas', async () => {
      const { gateway } = await conflictSetup();

      expect(screen.getByTestId('conflict-panel')).toHaveTextContent(
        'Esta nota mudou em outro lugar',
      );
      expect(area()).toHaveValue(`${aNote().body} meu texto`);
      expect(gateway.updates).toHaveLength(1);
      expect(screen.getByTestId('note-save')).toHaveAttribute('aria-disabled', 'true');
    });

    it('Dado "Ver diferença", então mostra as linhas só do servidor e as do usuário, como texto', async () => {
      await conflictSetup();

      await userEvent.click(screen.getByTestId('conflict-toggle-diff'));

      const diff = screen.getByTestId('conflict-diff');
      expect(within(diff).getByText('texto do servidor')).toBeInTheDocument();
      expect(diff).toHaveTextContent('Só no servidor');
      expect(diff).toHaveTextContent('No seu texto');
    });

    it('Dado "Salvar o meu texto por cima", então reenvia o texto dele com a versão do servidor', async () => {
      const { gateway, fixture } = await conflictSetup();

      await userEvent.click(screen.getByTestId('conflict-keep-mine'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(gateway.updates.at(-1)).toEqual({
        id: 'note-1',
        body: `${aNote().body} meu texto`,
        version: 7,
      });
      expect(screen.queryByTestId('conflict-panel')).not.toBeInTheDocument();
      expect(area()).toHaveValue(`${aNote().body} meu texto`);
    });

    it('Dado "Usar a versão do servidor", então troca o texto por escolha explícita', async () => {
      await conflictSetup();

      await userEvent.click(screen.getByTestId('conflict-use-remote'));

      expect(area()).toHaveValue('texto do servidor\nlinha 2');
      expect(screen.queryByTestId('conflict-panel')).not.toBeInTheDocument();
      expect(screen.getByTestId('note-status')).toHaveTextContent('Tudo salvo');
    });
  });

  describe('conflito em renomear/vincular com o rascunho limpo (F4)', () => {
    async function addMonthLink(fixture: {
      whenStable(): Promise<unknown>;
      detectChanges(): void;
    }) {
      await userEvent.click(screen.getByTestId('link-add'));
      await userEvent.click(screen.getByTestId('picker-type'));
      await userEvent.click(screen.getByRole('option', { name: 'Resumo mensal' }));
      await userEvent.click(screen.getByTestId('picker-month'));
      await userEvent.click(await screen.findByTestId('picker-month-grid-2026-10'));
      await userEvent.click(screen.getByTestId('picker-add-month'));
      await fixture.whenStable();
      fixture.detectChanges();
    }

    it('Dado conflito ao renomear sem ter digitado, então adota o texto do servidor, refaz o renomear e nunca oferece sobrescrever', async () => {
      const gateway = new NotesGatewayStub();
      const { fixture } = await setup(gateway);
      await userEvent.click(screen.getByTestId('note-menu'));
      await userEvent.click(screen.getByTestId('note-menu-item-rename'));
      gateway.moveQueue.push(failWith(409, 'VERSION_CONFLICT'));
      gateway.getResult = of(aNote({ version: 7, body: 'editado em outra aba' }));

      const input = screen.getByTestId('move-path');
      await userEvent.clear(input);
      await userEvent.type(input, 'reviews/outubro.md');
      await userEvent.click(screen.getByTestId('move-submit'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(screen.queryByTestId('conflict-keep-mine')).not.toBeInTheDocument();
      expect(gateway.moves.at(-1)).toEqual({
        id: 'note-1',
        newPath: 'reviews/outubro.md',
        version: 7,
      });
      expect(gateway.updates).toEqual([]);
      expect(area()).toHaveValue('editado em outra aba');
    });

    it('Dado conflito ao vincular sem ter digitado, então refaz o vínculo na versão nova e nunca grava o texto antigo por cima', async () => {
      const gateway = new NotesGatewayStub();
      const { fixture } = await setup(gateway);
      gateway.setLinksQueue.push(failWith(409, 'VERSION_CONFLICT'));
      gateway.getResult = of(aNote({ version: 7, body: 'editado em outra aba' }));

      await addMonthLink(fixture);

      expect(screen.queryByTestId('conflict-keep-mine')).not.toBeInTheDocument();
      expect(gateway.linkSets.at(-1)).toEqual({
        id: 'note-1',
        links: [{ type: 'MONTHLY_SUMMARY', key: '2026-10' }],
        version: 7,
      });
      expect(gateway.updates).toEqual([]);
      expect(area()).toHaveValue('editado em outra aba');
    });

    it('Dado conflito ao vincular com texto digitado, então o painel diz que o vínculo não foi aplicado e mantém a escolha do usuário', async () => {
      const gateway = new NotesGatewayStub();
      const { fixture } = await setup(gateway);
      await type(' meu texto');
      gateway.setLinksQueue.push(failWith(409, 'VERSION_CONFLICT'));
      gateway.getResult = of(aNote({ version: 7, body: 'editado em outra aba' }));

      await addMonthLink(fixture);

      expect(screen.getByTestId('conflict-description')).toHaveTextContent(
        pt.notes.editor.conflict.descriptionLinks,
      );
      expect(screen.getByTestId('conflict-keep-mine')).toBeInTheDocument();
      expect(gateway.linkSets).toHaveLength(1);
    });
  });

  describe('renomear', () => {
    async function openMove(gateway: NotesGatewayStub) {
      const result = await setup(gateway);
      await userEvent.click(screen.getByTestId('note-menu'));
      await userEvent.click(screen.getByTestId('note-menu-item-rename'));
      return result;
    }

    it('Dado renomear, então envia o novo caminho e mostra quantas notas tiveram links reescritos', async () => {
      const gateway = new NotesGatewayStub();
      gateway.moveResult = of({
        note: aNote({ path: 'reviews/outubro.md', version: 4 }),
        rewrittenNotes: [
          { id: 'n2', path: 'a.md', title: 'Nota A' },
          { id: 'n3', path: 'b.md', title: 'Nota B' },
        ],
      });
      const { fixture } = await openMove(gateway);

      const input = screen.getByTestId('move-path');
      await userEvent.clear(input);
      await userEvent.type(input, 'reviews/outubro.md');
      await userEvent.click(screen.getByTestId('move-submit'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(gateway.calls).toContain('move:note-1:reviews/outubro.md:3');
      expect(screen.getByTestId('note-moved')).toHaveTextContent(
        '2 notas tiveram links reescritos',
      );
      expect(screen.getByTestId('note-moved-n2')).toHaveAttribute('href', '/notes/n2');
      expect(screen.getByTestId('note-path')).toHaveTextContent('reviews/outubro.md');
    });

    it('Dado nenhuma nota reescrita, então diz que nenhum link precisou mudar', async () => {
      const gateway = new NotesGatewayStub();
      const { fixture } = await openMove(gateway);

      await userEvent.click(screen.getByTestId('move-submit'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(screen.getByTestId('note-moved')).toHaveTextContent(
        'Nenhuma outra nota precisou mudar de link.',
      );
    });

    it('Dado o caminho ocupado (422), então o motivo aparece na folha e nada some', async () => {
      const gateway = new NotesGatewayStub();
      gateway.moveResult = failWith(422, 'NOTE_PATH_TAKEN') as never;
      const { fixture } = await openMove(gateway);

      await userEvent.click(screen.getByTestId('move-submit'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(screen.getByTestId('move-error')).toHaveTextContent(/Já existe uma nota/);
    });

    it('Dado caminho sem .md ou com caractere proibido, então avisa antes de enviar', async () => {
      const gateway = new NotesGatewayStub();
      await openMove(gateway);

      const input = screen.getByTestId('move-path');
      await userEvent.clear(input);
      await userEvent.type(input, 'sem-extensao');
      await userEvent.click(screen.getByTestId('move-submit'));

      expect(screen.getByTestId('move-error')).toHaveTextContent(pt.notes.editor.move.pathInvalid);
      expect(gateway.calls.some((c) => c.startsWith('move:'))).toBe(false);
    });

    it('Dado texto não salvo, então renomear fica bloqueado com a razão', async () => {
      const gateway = new NotesGatewayStub();
      await setup(gateway);
      await type(' x');
      await userEvent.click(screen.getByTestId('note-menu'));
      await userEvent.click(screen.getByTestId('note-menu-item-rename'));

      expect(screen.getByTestId('move-save-first')).toHaveTextContent(
        pt.notes.editor.move.saveFirst,
      );
      await userEvent.click(screen.getByTestId('move-submit'));
      expect(gateway.calls.some((c) => c.startsWith('move:'))).toBe(false);
    });
  });

  describe('lixeira', () => {
    it('Dado "Mover para a lixeira", então pede confirmação, a nota vai para a lixeira e pode ser restaurada', async () => {
      const gateway = new NotesGatewayStub();
      const { fixture } = await setup(gateway);

      await userEvent.click(screen.getByTestId('note-menu'));
      await userEvent.click(screen.getByTestId('note-menu-item-trash'));
      expect(gateway.calls).not.toContain('trash:note-1');
      await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(gateway.calls).toContain('trash:note-1');
      expect(screen.getByTestId('note-trashed')).toHaveTextContent(pt.notes.editor.trashed);
      expect(area()).toBeDisabled();
      expect(screen.queryByTestId('note-save')).not.toBeInTheDocument();

      await userEvent.click(screen.getByTestId('note-restore'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(gateway.calls).toContain('restore:note-1');
      expect(screen.queryByTestId('note-trashed')).not.toBeInTheDocument();
      expect(area()).toBeEnabled();
    });

    it('Dado texto não salvo, então a confirmação avisa que será descartado', async () => {
      await setup();
      await type(' x');

      await userEvent.click(screen.getByTestId('note-menu'));
      await userEvent.click(screen.getByTestId('note-menu-item-trash'));

      expect(screen.getByRole('dialog')).toHaveTextContent(pt.notes.editor.trashConfirm.dirty);
    });

    it('Dado cancelar a confirmação, então nada é enviado', async () => {
      const { gateway } = await setup();

      await userEvent.click(screen.getByTestId('note-menu'));
      await userEvent.click(screen.getByTestId('note-menu-item-trash'));
      await userEvent.click(screen.getByTestId('confirm-dialog-cancel'));

      expect(gateway.calls).not.toContain('trash:note-1');
    });
  });

  describe('sair com alterações não salvas', () => {
    it('Dado nada alterado, então a rota sai direto', async () => {
      const { fixture } = await setup();

      await expect(fixture.componentInstance.confirmLeave()).resolves.toBe(true);
    });

    it('Dado texto não salvo, então pergunta; "Continuar editando" fica e "Sair sem salvar" sai', async () => {
      const { fixture } = await setup();
      await type(' x');
      // O foco volta ao campo ao fechar o diálogo; tirá-lo antes evita o evento de foco dentro do ciclo do Angular.
      area().blur();

      const stay = fixture.componentInstance.confirmLeave();
      await fixture.whenStable();
      expect(screen.getByRole('dialog', { name: pt.notes.editor.leave.title })).toBeInTheDocument();
      await userEvent.click(screen.getByTestId('confirm-dialog-cancel'));
      await expect(stay).resolves.toBe(false);

      const leave = fixture.componentInstance.confirmLeave();
      await fixture.whenStable();
      await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));
      await expect(leave).resolves.toBe(true);
    });

    it('Dado a aba do navegador, então o beforeunload só é cancelado com alterações', async () => {
      await setup();

      const clean = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(clean);
      expect(clean.defaultPrevented).toBe(false);

      await type(' x');
      const dirty = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(dirty);
      expect(dirty.defaultPrevented).toBe(true);
    });

    it('Dado a rota real, então o canDeactivate usa o diálogo', async () => {
      const { fixture } = await setup();
      const router = TestBed.inject(Router);
      expect(router).toBeTruthy();
      expect(typeof fixture.componentInstance.confirmLeave).toBe('function');
    });
  });

  describe('vínculos e backlinks', () => {
    it('Dado a nota, então o painel mostra os vínculos, os links no texto e os backlinks do backend', async () => {
      const gateway = new NotesGatewayStub();
      gateway.getResult = of(aNote({ links: [anExplicitLink(), aWikilink()] }));
      gateway.backlinkItems = [
        {
          noteId: 'n9',
          path: 'projetos/MG Tech.md',
          title: 'MG Tech',
          context: 'veja [[2026-10]]',
        },
      ];
      await setup(gateway);

      expect(screen.getByTestId('link-open-0')).toHaveAttribute('href', '/transactions/tx-1');
      expect(screen.getByTestId('wikilink-open-0')).toHaveAttribute('href', '/notes/note-2');
      expect(screen.getByTestId('backlink-n9')).toHaveTextContent('MG Tech');
    });

    it('Dado "Vincular" e a escolha de uma meta, então chama PUT /links com os vínculos de antes e o novo, e avisa', async () => {
      const gateway = new NotesGatewayStub();
      gateway.getResult = of(aNote({ links: [anExplicitLink()] }));
      const { fixture } = await setup(gateway);

      await userEvent.click(screen.getByTestId('link-add'));
      await userEvent.click(screen.getByTestId('picker-type'));
      await userEvent.click(screen.getByRole('option', { name: 'Resumo mensal' }));
      await userEvent.click(screen.getByTestId('picker-month'));
      await userEvent.click(await screen.findByTestId('picker-month-grid-2026-10'));
      await userEvent.click(screen.getByTestId('picker-add-month'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(gateway.linkSets).toEqual([
        {
          id: 'note-1',
          links: [
            { type: 'TRANSACTION', id: 'tx-1' },
            { type: 'MONTHLY_SUMMARY', key: '2026-10' },
          ],
          version: 3,
        },
      ]);
      expect(screen.queryByTestId('link-picker')).not.toBeInTheDocument();
    });

    it('Dado NOTE_LINK_TARGET_NOT_FOUND, então a mensagem aparece na folha e ela continua aberta', async () => {
      const gateway = new NotesGatewayStub();
      const { fixture } = await setup(gateway);
      gateway.next = failWith(422, 'NOTE_LINK_TARGET_NOT_FOUND');

      await userEvent.click(screen.getByTestId('link-add'));
      await userEvent.click(screen.getByTestId('picker-type'));
      await userEvent.click(screen.getByRole('option', { name: 'Resumo mensal' }));
      await userEvent.click(screen.getByTestId('picker-month'));
      await userEvent.click(await screen.findByTestId('picker-month-grid-2026-10'));
      await userEvent.click(screen.getByTestId('picker-add-month'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(screen.getByTestId('picker-error')).toHaveTextContent(/não existe mais/);
      expect(screen.queryByTestId('note-error')).not.toBeInTheDocument();
    });

    it('Dado "Remover vínculo", então reenvia só os outros vínculos', async () => {
      const gateway = new NotesGatewayStub();
      gateway.getResult = of(
        aNote({
          links: [
            anExplicitLink(),
            anExplicitLink({
              type: 'GOAL',
              target: { id: 'g1', key: null, label: 'Reserva', status: 'ACTIVE' },
            }),
          ],
        }),
      );
      const { fixture } = await setup(gateway);

      await userEvent.click(screen.getByTestId('link-remove-0'));
      await fixture.whenStable();

      expect(gateway.linkSets.at(-1)?.links).toEqual([{ type: 'GOAL', id: 'g1' }]);
    });

    it('Dado link pendente no texto, então "Criar nota" abre a folha com o nome e cria; a nota é recarregada para resolver', async () => {
      const gateway = new NotesGatewayStub();
      gateway.getResult = of(
        aNote({ links: [aWikilink({ text: 'Nova ideia', state: 'PENDING', target: null })] }),
      );
      const { fixture } = await setup(gateway);

      await userEvent.click(screen.getByTestId('wikilink-create-0'));
      expect(screen.getByTestId('new-note-name')).toHaveValue('Nova ideia');
      await userEvent.click(screen.getByTestId('new-note-submit'));
      await fixture.whenStable();

      expect(gateway.creates.at(-1)?.path).toBe('Nova ideia.md');
      expect(gateway.calls.filter((c) => c === 'get:note-1').length).toBeGreaterThan(1);
    });
  });

  describe('375 px (celular)', () => {
    it('Dado o celular, então há abas Escrever e Ler (tablist) e a leitura mostra a pré-visualização', async () => {
      await setup(new NotesGatewayStub(), true);

      expect(screen.getByRole('tablist', { name: pt.notes.editor.modeLabel })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Escrever' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(screen.queryByTestId('note-split')).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('tab', { name: 'Ler' }));

      expect(screen.getByTestId('note-preview')).toHaveTextContent('Revisão de outubro');
    });

    it('Dado o desktop, então editor e pré-visualização ficam lado a lado, sem abas', async () => {
      await setup();

      expect(screen.getByTestId('note-split')).toBeInTheDocument();
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    });
  });

  it('Dado a tela, então o axe não aponta violações', async () => {
    const { container } = await setup();

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it('Dado o conflito aberto, então o axe não aponta violações', async () => {
    const gateway = new NotesGatewayStub();
    const { container, fixture } = await setup(gateway);
    await type(' x');
    gateway.updateQueue.push(failWith(409, 'VERSION_CONFLICT'));
    gateway.getResult = of(aNote({ version: 7, body: 'outro' }));
    await userEvent.click(screen.getByTestId('note-save'));
    await fixture.whenStable();
    fixture.detectChanges();
    await userEvent.click(screen.getByTestId('conflict-toggle-diff'));

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
