import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { TextAreaComponent } from '~/app/common/components/forms/text-area/text-area.component';
import { LiveAnnouncer } from '~/app/common/components/overlay/live-announcer.service';
import { ViewportService } from '~/app/common/components/overlay/viewport.service';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { DisplayTextPipe } from '~/app/common/pipes/display-text.pipe';
import { NoteSuggestFacade } from '~/modules/notes/core/facades/note-suggest.facade';
import { MAX_NOTE_BYTES } from '~/modules/notes/core/types/note';
import { pathWithoutExtension, utf8Length } from '~/modules/notes/core/types/note-path';
import { formatBytes } from '~/util/format-bytes';
import {
  completeWikilink,
  type Edit,
  indent,
  insertLink,
  insertWikilink,
  toggleLinePrefix,
  toggleWrap,
  wikilinkContext,
  type WikilinkContext,
} from '~/util/markdown/markdown-edit';

let nextId = 0;

/** Plataforma da Apple usa Cmd; as demais, Ctrl. Só para mostrar o atalho certo no texto de ajuda. */
function usesCommandKey(document: Document): boolean {
  const nav = document.defaultView?.navigator;
  return /Mac|iPhone|iPad/i.test(nav?.platform || nav?.userAgent || '');
}

/**
 * Editor de Markdown (textarea própria do design system, sem controle nativo problemático): atalhos
 * `Ctrl/Cmd+B`, `I`, `K` e `S`, `Tab`/`Shift+Tab` para recuar (**sem prender o foco**: `Esc` e depois `Tab` sai
 * do campo, dito no texto de ajuda: WCAG 2.1.2), barra de formatação para quem não usa teclado físico e
 * autocomplete de `[[` com notas existentes (`role="listbox"` + `aria-activedescendant`, setas/Enter/Esc,
 * quantidade de resultados anunciada; o `<textarea>` não aceita `role="combobox"`, ver `TextArea`). A edição preserva o desfazer
 * do navegador. No celular a altura acompanha o `visualViewport`, então o teclado não cobre o cursor. Mostra o
 * tamanho em bytes contra o limite de 200 KB. O texto é **dado**: nada aqui o interpreta como HTML.
 */
@Component({
  selector: 'app-markdown-editor',
  imports: [ReactiveFormsModule, TextAreaComponent, DisplayTextPipe],
  providers: [NoteSuggestFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.height.px]': 'compactHeight()' },
  template: `
    <div class="editor" data-cy="markdown-editor">
      <div class="editor__toolbar" role="toolbar" [attr.aria-label]="t().notes.editor.toolbarLabel">
        @for (tool of tools(); track tool.id) {
          <button
            type="button"
            class="button editor__tool"
            [disabled]="readonly()"
            [attr.data-cy]="'editor-tool-' + tool.id"
            (mousedown)="$event.preventDefault()"
            (click)="run(tool.id)"
          >
            {{ tool.label }}
          </button>
        }
      </div>

      <div class="editor__field">
        <app-text-area
          #area
          [formControl]="control()"
          fieldId="note-text"
          [label]="t().notes.editor.textLabel"
          [hideLabel]="true"
          [monospace]="true"
          [fillHeight]="true"
          [rows]="12"
          [autocompleteList]="true"
          [ariaControls]="suggesting() ? listboxId : undefined"
          [ariaActivedescendant]="activeOptionId()"
          [describedByExtra]="helpId + ' ' + sizeId"
          (keyPressed)="onKey($event)"
          (selectionChanged)="onSelection()"
        />
        @if (suggesting()) {
          <ul
            class="editor__options surface"
            role="listbox"
            [attr.aria-label]="t().notes.picker.resultsLabel"
            [id]="listboxId"
            data-cy="wikilink-options"
          >
            @for (option of suggest.suggestions(); track option.id; let i = $index) {
              <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -- combobox: o foco fica no campo (aria-activedescendant); as opções não entram na tabulação e o teclado é tratado no campo -->
              <li
                role="option"
                class="editor__option"
                [id]="optionId(i)"
                [class.is-active]="i === active()"
                [attr.aria-selected]="i === active()"
                [attr.data-cy]="'wikilink-option-' + option.id"
                (mousedown)="$event.preventDefault()"
                (click)="accept(i)"
              >
                <span class="editor__option-title"
                  ><bdi>{{ option.title | displayText }}</bdi></span
                >
                <span class="editor__option-path"
                  ><bdi>{{ option.path | displayText }}</bdi></span
                >
              </li>
            }
          </ul>
        }
      </div>

      <div class="editor__foot">
        <p class="editor__help" [id]="helpId" data-cy="editor-help">{{ help() }}</p>
        <p
          class="editor__size num"
          [class.is-over]="tooLarge()"
          [id]="sizeId"
          data-cy="editor-size"
        >
          {{ sizeText() }}
        </p>
      </div>
      @if (tooLarge()) {
        <p class="editor__error" role="alert" data-cy="editor-too-large">
          {{ t().notes.editor.tooLarge }}
        </p>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .editor {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto auto;
      gap: var(--space-2);
      height: 100%;
      min-height: 16rem;
    }

    .editor__toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1);
    }

    .editor__tool {
      min-height: var(--touch-min);
      padding: 0 var(--space-3);
      font-size: var(--text-sm);
    }

    .editor__field {
      position: relative;
      min-height: 0;
    }

    .editor__options {
      position: absolute;
      right: 0;
      bottom: var(--space-2);
      left: 0;
      z-index: var(--z-raised);
      max-height: 12rem;
      margin: 0;
      padding: var(--space-1);
      overflow-y: auto;
      list-style: none;
      box-shadow: var(--shadow-popover);
    }

    .editor__option {
      display: grid;
      gap: 2px;
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-control);
      cursor: pointer;
    }

    .editor__option.is-active {
      background-color: var(--color-surface-muted);
      box-shadow: inset 2px 0 0 var(--color-accent);
    }

    .editor__option-title {
      font-weight: var(--weight-medium);
    }

    .editor__option-path {
      color: var(--color-text-muted);
      font-size: var(--text-xs);
    }

    .editor__foot {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-2);
    }

    .editor__help,
    .editor__size {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--text-xs);
    }

    .editor__size.is-over,
    .editor__error {
      color: var(--color-risk);
    }

    .editor__error {
      margin: 0;
      font-size: var(--text-xs);
    }
  `,
})
export class MarkdownEditorComponent {
  private readonly document = inject(DOCUMENT);
  private readonly i18n = inject(I18nService);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly viewport = inject(ViewportService);
  protected readonly suggest = inject(NoteSuggestFacade);
  protected readonly t = this.i18n.t;

  /** O texto da nota (Markdown cru). */
  readonly control = input.required<FormControl<string>>();
  /** Nota na lixeira: nada se edita. */
  readonly readonly = input(false);
  readonly maxBytes = input(MAX_NOTE_BYTES);

  /** `Ctrl/Cmd+S`. */
  readonly saveRequested = output<void>();

  private readonly area = viewChild.required<TextAreaComponent>('area');

  private readonly uid = ++nextId;
  protected readonly helpId = `note-text-help-${this.uid}`;
  protected readonly sizeId = `note-text-size-${this.uid}`;
  protected readonly listboxId = `note-wikilinks-${this.uid}`;

  private readonly text = signal('');
  protected readonly bytes = computed(() => utf8Length(this.text()));
  protected readonly tooLarge = computed(() => this.bytes() > this.maxBytes());
  protected readonly sizeText = computed(() => {
    const locale = HTML_LANG[this.i18n.language()];
    return interpolate(this.t().notes.editor.size, {
      used: formatBytes(this.bytes(), locale),
      max: formatBytes(this.maxBytes(), locale),
    });
  });

  private readonly mac = usesCommandKey(this.document);
  protected readonly help = computed(() => {
    const mod = this.mac ? '⌘' : 'Ctrl+';
    return interpolate(this.t().notes.editor.keyboardHelp, {
      save: `${mod}S`,
      bold: `${mod}B`,
      italic: `${mod}I`,
      link: `${mod}K`,
    });
  });

  protected readonly tools = computed(() => {
    const copy = this.t().notes.editor;
    return [
      { id: 'bold', label: copy.bold },
      { id: 'italic', label: copy.italic },
      { id: 'link', label: copy.linkTool },
      { id: 'wikilink', label: copy.wikilinkTool },
      { id: 'list', label: copy.listTool },
      { id: 'quote', label: copy.quoteTool },
      { id: 'code', label: copy.codeTool },
    ] as const;
  });

  // Autocomplete de `[[`.
  private readonly wikilink = signal<WikilinkContext | null>(null);
  /** `start` do `[[` que o usuário dispensou com Esc: não reabre até começar outro. */
  private dismissedAt = -1;
  protected readonly active = signal(0);
  protected readonly suggesting = computed(
    () => this.wikilink() !== null && this.suggest.suggestions().length > 0,
  );
  protected readonly activeOptionId = computed(() =>
    this.suggesting() ? this.optionId(this.active()) : undefined,
  );

  /** `Esc` apertado: o próximo `Tab` sai do campo em vez de recuar o texto. */
  private escapeArmed = false;

  // Altura no celular: acompanha o `visualViewport` (o teclado virtual não cobre o cursor).
  private readonly view = this.document.defaultView;
  private readonly viewportHeight = signal(
    this.view?.visualViewport?.height ?? this.view?.innerHeight ?? 800,
  );
  protected readonly compactHeight = computed<number | null>(() => {
    if (!this.viewport.compact()) return null;
    return Math.min(640, Math.max(240, Math.round(this.viewportHeight() - 260)));
  });

  constructor() {
    // O contador de bytes e o autocomplete seguem o valor do controle (digitado ou escrito por fora).
    effect((onCleanup) => {
      const control = this.control();
      untracked(() => this.text.set(control.value));
      const subscription = control.valueChanges.subscribe((value) => this.text.set(value));
      onCleanup(() => subscription.unsubscribe());
    });
    effect(() => {
      if (this.readonly()) this.control().disable({ emitEvent: false });
      else this.control().enable({ emitEvent: false });
    });
    // Anuncia a quantidade de sugestões (leitor de tela).
    effect(() => {
      const count = this.suggest.suggestions().length;
      if (this.wikilink() === null) return;
      untracked(() => {
        this.announcer.announce(
          interpolate(this.t().notes.picker.resultsCount, { count: String(count) }),
        );
      });
    });
    effect(() => {
      this.suggest.suggestions();
      untracked(() => this.active.set(0));
    });
    const visual = this.view?.visualViewport;
    if (visual) {
      const update = () => this.viewportHeight.set(visual.height);
      visual.addEventListener('resize', update);
      visual.addEventListener('scroll', update);
      inject(DestroyRef).onDestroy(() => {
        visual.removeEventListener('resize', update);
        visual.removeEventListener('scroll', update);
      });
    }
  }

  protected optionId(index: number): string {
    return `${this.listboxId}-${index}`;
  }

  /** Foca o campo de texto (a página usa ao abrir o editor). */
  focus(): void {
    this.area().focus();
  }

  private value(): string {
    return this.control().value;
  }

  private apply(edit: Edit | null): void {
    if (!edit) return;
    this.area().replaceRange(edit.from, edit.to, edit.insert, edit.selectStart, edit.selectEnd);
  }

  protected run(tool: string): void {
    const text = this.value();
    const selection = this.area().selection();
    switch (tool) {
      case 'bold':
        this.apply(toggleWrap(text, selection, '**'));
        break;
      case 'italic':
        this.apply(toggleWrap(text, selection, '*'));
        break;
      case 'code':
        this.apply(toggleWrap(text, selection, '`'));
        break;
      case 'link':
        this.apply(insertLink(text, selection));
        break;
      case 'wikilink':
        this.apply(insertWikilink(text, selection));
        break;
      case 'list':
        this.apply(toggleLinePrefix(text, selection, '- '));
        break;
      case 'quote':
        this.apply(toggleLinePrefix(text, selection, '> '));
        break;
    }
  }

  protected onKey(event: KeyboardEvent): void {
    // Composição de IME: as teclas são do IME (confirmar, trocar candidato), não atalhos do editor.
    if (event.isComposing || event.keyCode === 229) return;
    if (this.suggesting() && this.onSuggestKey(event)) return;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && !event.altKey && !event.shiftKey) {
      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        event.stopPropagation();
        this.saveRequested.emit();
        return;
      }
      if (key === 'b' || key === 'i' || key === 'k') {
        event.preventDefault();
        this.run(key === 'b' ? 'bold' : key === 'i' ? 'italic' : 'link');
        return;
      }
    }
    if (event.key === 'Tab' && !mod && !event.altKey) {
      // `Esc` e depois `Tab` deixa o foco sair (nada de armadilha de teclado).
      if (this.escapeArmed) {
        this.escapeArmed = false;
        return;
      }
      event.preventDefault();
      this.apply(indent(this.value(), this.area().selection(), event.shiftKey));
      return;
    }
    this.escapeArmed = event.key === 'Escape';
  }

  /** Teclas com a lista de sugestões aberta; `true` = a tecla foi tratada. */
  private onSuggestKey(event: KeyboardEvent): boolean {
    const count = this.suggest.suggestions().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.active.set((this.active() + 1) % count);
        return true;
      case 'ArrowUp':
        event.preventDefault();
        this.active.set((this.active() - 1 + count) % count);
        return true;
      case 'Home':
        event.preventDefault();
        this.active.set(0);
        return true;
      case 'End':
        event.preventDefault();
        this.active.set(count - 1);
        return true;
      case 'Enter':
      case 'Tab':
        event.preventDefault();
        this.accept(this.active());
        return true;
      case 'Escape': {
        // Fecha a lista sem sair do campo e sem armar o "Esc, Tab".
        event.preventDefault();
        this.dismissedAt = this.wikilink()?.start ?? -1;
        this.wikilink.set(null);
        this.suggest.clear();
        return true;
      }
      default:
        return false;
    }
  }

  protected onSelection(): void {
    const text = this.value();
    this.text.set(text);
    const { start, end } = this.area().selection();
    const context = start === end ? wikilinkContext(text, start) : null;
    if (context === null || context.start === this.dismissedAt) {
      if (context === null) this.dismissedAt = -1;
      if (this.wikilink() !== null) {
        this.wikilink.set(null);
        this.suggest.clear();
      }
      return;
    }
    const previous = this.wikilink();
    this.wikilink.set(context);
    if (previous === null || previous.query !== context.query || previous.start !== context.start) {
      this.suggest.search(context.query);
    }
  }

  protected accept(index: number): void {
    const option = this.suggest.suggestions()[index];
    const context = this.wikilink();
    if (!option || !context) return;
    const caret = this.area().selection().start;
    this.apply(completeWikilink(this.value(), context, caret, pathWithoutExtension(option.path)));
    this.wikilink.set(null);
    this.suggest.clear();
  }
}
