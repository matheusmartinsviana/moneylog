import { Component, signal } from '@angular/core';
import { FormControl } from '@angular/forms';
import { fireEvent, render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { MarkdownEditorComponent } from '~/app/features/notes/components/markdown-editor/markdown-editor.component';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { aSummary, NotesGatewayStub, provideNotesStub } from '~/testing/notes-testing';

vi.setConfig({ testTimeout: 30_000 });

@Component({
  imports: [MarkdownEditorComponent],
  template: `
    <app-markdown-editor
      [control]="control"
      [readonly]="readonly()"
      (saveRequested)="saves = saves + 1"
    />
    <button type="button" data-cy="after">depois</button>
  `,
})
class HostComponent {
  readonly control = new FormControl('', { nonNullable: true });
  readonly readonly = signal(false);
  saves = 0;
}

async function setup(value = '', gateway = new NotesGatewayStub()) {
  const result = await render(HostComponent, {
    providers: [provideI18nTesting('pt'), provideNotesStub(gateway)],
  });
  result.fixture.componentInstance.control.setValue(value);
  result.fixture.detectChanges();
  const area = screen.getByTestId('note-text') as HTMLTextAreaElement;
  return { ...result, gateway, area, control: result.fixture.componentInstance.control };
}

function select(area: HTMLTextAreaElement, start: number, end = start) {
  area.focus();
  area.setSelectionRange(start, end);
}

describe('MarkdownEditorComponent', () => {
  describe('atalhos', () => {
    it('Dado Ctrl+B com seleção, então envolve em negrito e mantém a seleção', async () => {
      const { area, control } = await setup('um dois três');
      select(area, 3, 7);

      fireEvent.keyDown(area, { key: 'b', ctrlKey: true });

      expect(control.value).toBe('um **dois** três');
      expect(area.value.slice(area.selectionStart, area.selectionEnd)).toBe('dois');
    });

    it('Dado Cmd+I (macOS), então envolve em itálico; de novo, desfaz', async () => {
      const { area, control } = await setup('um dois três');
      select(area, 3, 7);

      fireEvent.keyDown(area, { key: 'i', metaKey: true });
      expect(control.value).toBe('um *dois* três');
      fireEvent.keyDown(area, { key: 'i', metaKey: true });
      expect(control.value).toBe('um dois três');
    });

    it('Dado Ctrl+K, então cria o link e deixa a url selecionada', async () => {
      const { area, control } = await setup('veja isto');
      select(area, 5, 9);

      fireEvent.keyDown(area, { key: 'k', ctrlKey: true });

      expect(control.value).toBe('veja [isto](url)');
      expect(area.value.slice(area.selectionStart, area.selectionEnd)).toBe('url');
    });

    it('Dado Ctrl+S ou Cmd+S, então pede para salvar e o navegador não abre o "Salvar página"', async () => {
      const { area, fixture } = await setup('x');
      area.focus();

      await userEvent.keyboard('{Control>}s{/Control}{Meta>}s{/Meta}');

      expect(fixture.componentInstance.saves).toBe(2);
    });

    it('Dado a edição por atalho, então o desfazer do navegador continua possível (usa insertText quando existe)', async () => {
      const { area } = await setup('abc');
      const exec = vi.fn(() => false);
      Object.defineProperty(document, 'execCommand', { value: exec, configurable: true });
      select(area, 0, 3);

      await userEvent.keyboard('{Control>}b{/Control}');

      expect(exec).toHaveBeenCalledWith('insertText', false, '**abc**');
      Reflect.deleteProperty(document, 'execCommand');
    });
  });

  describe('Tab e o foco (sem armadilha de teclado)', () => {
    it('Dado Tab no editor, então recua o texto e o foco fica', async () => {
      const { area, control } = await setup('a');
      select(area, 0);

      await userEvent.keyboard('{Tab}');

      expect(control.value).toBe('  a');
      expect(area).toHaveFocus();
    });

    it('Dado Shift+Tab, então tira o recuo', async () => {
      const { area, control } = await setup('  a');
      select(area, 3);

      await userEvent.keyboard('{Shift>}{Tab}{/Shift}');

      expect(control.value).toBe('a');
      expect(area).toHaveFocus();
    });

    it('Dado Esc e depois Tab, então o foco SAI do campo (requisito de acessibilidade)', async () => {
      const { area, control } = await setup('a');
      select(area, 0);

      await userEvent.keyboard('{Escape}{Tab}');

      expect(control.value).toBe('a');
      expect(area).not.toHaveFocus();
    });

    it('Dado Esc, outra tecla e Tab, então o Tab volta a recuar (o Esc não fica armado)', async () => {
      const { area, control } = await setup('a');
      select(area, 0);

      await userEvent.keyboard('{Escape}b{Tab}');

      expect(area).toHaveFocus();
      expect(control.value).toBe('b  a');
    });

    it('Dado o texto de ajuda, então documenta Tab, Esc e os atalhos e está ligado ao campo', async () => {
      const { area } = await setup();

      const help = screen.getByTestId('editor-help');
      expect(help).toHaveTextContent(/Esc e depois Tab/);
      expect(help).toHaveTextContent('Ctrl+S');
      expect(area.getAttribute('aria-describedby')).toContain(help.id);
    });
  });

  describe('barra de formatação', () => {
    it('Dado os botões, então formatam a seleção sem precisar de teclado físico', async () => {
      const { area, control } = await setup('um dois');
      select(area, 3, 7);

      await userEvent.click(screen.getByTestId('editor-tool-bold'));
      expect(control.value).toBe('um **dois**');
      await userEvent.click(screen.getByTestId('editor-tool-list'));
      expect(control.value).toBe('- um **dois**');
      await userEvent.click(screen.getByTestId('editor-tool-quote'));
      expect(control.value).toBe('> - um **dois**');
    });

    it('Dado o botão de link para nota, então insere [[ ]]', async () => {
      const { control, area } = await setup('ver MacBook');
      select(area, 4, 11);

      await userEvent.click(screen.getByTestId('editor-tool-wikilink'));

      expect(control.value).toBe('ver [[MacBook]]');
    });

    it('Dado a barra, então é um toolbar com nome', async () => {
      await setup();

      expect(screen.getByRole('toolbar', { name: 'Formatação' })).toBeInTheDocument();
    });
  });

  describe('tamanho', () => {
    it('Dado o texto, então mostra o tamanho em bytes contra o limite de 200 KB', async () => {
      await setup('éé');

      expect(screen.getByTestId('editor-size')).toHaveTextContent('4 B de 200 KB');
      expect(screen.queryByTestId('editor-too-large')).not.toBeInTheDocument();
    });

    it('Dado texto acima do limite (em bytes, não em caracteres), então marca o erro', async () => {
      await setup('é'.repeat(110_000));

      expect(screen.getByTestId('editor-too-large')).toBeInTheDocument();
    });

    it('Dado texto de 200 KB, então o editor segue utilizável', async () => {
      const { area, control } = await setup('a'.repeat(200 * 1024));

      await userEvent.click(area);
      await userEvent.keyboard('{End}');
      expect(area).toHaveFocus();
      expect(control.value).toHaveLength(200 * 1024);
      expect(screen.queryByTestId('editor-too-large')).not.toBeInTheDocument();
    });
  });

  describe('somente leitura', () => {
    it('Dado nota na lixeira, então o campo e a barra ficam desabilitados', async () => {
      const { fixture, area } = await setup('x');

      fixture.componentInstance.readonly.set(true);
      fixture.detectChanges();

      expect(area).toBeDisabled();
      expect(screen.getByTestId('editor-tool-bold')).toBeDisabled();
    });
  });

  describe('autocomplete de [[', () => {
    const NOTES = [
      aSummary({ id: 'a', title: 'MacBook', path: 'projetos/MacBook.md' }),
      aSummary({ id: 'b', title: 'Mac mini', path: 'Mac mini.md' }),
    ];

    async function suggestSetup() {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const gateway = new NotesGatewayStub();
      gateway.notes = NOTES;
      const result = await setup('', gateway);
      result.area.focus();
      await userEvent.keyboard('ver [[[[mac');
      await vi.advanceTimersByTimeAsync(300);
      result.fixture.detectChanges();
      return result;
    }

    afterEach(() => vi.useRealTimers());

    it('Dado digitar [[, então abre a lista de notas: textbox ligado a um listbox por aria-activedescendant', async () => {
      const { area } = await suggestSetup();

      const listbox = screen.getByRole('listbox');
      expect(screen.getAllByRole('option')).toHaveLength(2);
      expect(area.getAttribute('aria-controls')).toBe(listbox.id);
      expect(area).toHaveAttribute('aria-autocomplete', 'list');
      expect(area).toHaveAttribute('aria-haspopup', 'listbox');
      expect(area.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[0]!.id);
      expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    });

    it('Dado a busca, então o termo digitado vai ao backend (só notas ativas)', async () => {
      const { gateway } = await suggestSetup();

      expect(gateway.queries.at(-1)).toMatchObject({ q: 'mac', status: 'ACTIVE' });
    });

    it('Dado as setas, então movem a opção ativa (com volta) e atualizam o aria-activedescendant', async () => {
      const { area } = await suggestSetup();

      await userEvent.keyboard('{ArrowDown}');
      expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
      expect(area.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[1]!.id);
      await userEvent.keyboard('{ArrowDown}');
      expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
      await userEvent.keyboard('{ArrowUp}');
      expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    });

    it('Dado Enter, então insere [[caminho]] da nota ativa e fecha a lista', async () => {
      const { control } = await suggestSetup();

      await userEvent.keyboard('{Enter}');

      expect(control.value).toBe('ver [[projetos/MacBook]]');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('Dado Enter durante a composição de um IME, então não aceita a sugestão (confirma o texto do IME)', async () => {
      const { area, control } = await suggestSetup();

      fireEvent.keyDown(area, { key: 'Enter', isComposing: true });
      fireEvent.keyDown(area, { key: 'Tab', keyCode: 229 });

      expect(control.value).toBe('ver [[mac');
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    it('Dado Tab com a lista aberta, então escolhe (em vez de recuar o texto)', async () => {
      const { control } = await suggestSetup();

      await userEvent.keyboard('{ArrowDown}{Tab}');

      expect(control.value).toBe('ver [[Mac mini]]');
    });

    it('Dado clicar numa opção, então a escolhe', async () => {
      const { control } = await suggestSetup();

      await userEvent.click(screen.getByTestId('wikilink-option-b'));

      expect(control.value).toBe('ver [[Mac mini]]');
    });

    it('Dado Esc, então fecha a lista, o texto fica e o foco continua no campo', async () => {
      const { area, control } = await suggestSetup();

      await userEvent.keyboard('{Escape}');

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(control.value).toBe('ver [[mac');
      expect(area).toHaveFocus();
      // O Esc da lista não arma o "Esc, Tab": o próximo Tab ainda recua.
      await userEvent.keyboard('{Tab}');
      expect(area).toHaveFocus();
    });

    it('Dado a lista aberta, então anuncia a quantidade de resultados para o leitor de tela', async () => {
      await suggestSetup();

      expect(
        Array.from(document.querySelectorAll('[data-cy="live-announcer"]'))
          .map((el) => el.textContent)
          .join(' '),
      ).toContain('2 resultados');
    });

    it('Dado sair do [[ (cursor fora ou colchetes fechados), então a lista some', async () => {
      const { control } = await suggestSetup();

      await userEvent.keyboard(']] fim');

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(control.value).toBe('ver [[mac]] fim');
    });

    it('Dado nenhuma nota encontrada, então não abre a lista e o Enter segue normal', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const gateway = new NotesGatewayStub();
      const { area, control } = await setup('', gateway);
      area.focus();

      await userEvent.keyboard('[[[[zzz');
      await vi.advanceTimersByTimeAsync(300);
      await userEvent.keyboard('{Enter}');

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(control.value).toBe('[[zzz\n');
    });

    it('Dado a lista aberta, então o axe não aponta violações', async () => {
      const { container } = await suggestSetup();

      const violations = await axeViolations(container);
      expect(violations, describeViolations(violations)).toEqual([]);
    });
  });

  it('Dado o editor, então o axe não aponta violações', async () => {
    const { container } = await setup('# Título');

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
