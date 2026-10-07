import { DOCUMENT } from '@angular/common';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  OnDestroy,
  signal,
  untracked,
  viewChild,
  ElementRef,
} from '@angular/core';
import { NG_VALIDATORS, NG_VALUE_ACCESSOR, ValidationErrors, Validator } from '@angular/forms';

import {
  ChoiceOption,
  edgeEnabled,
  nextEnabled,
} from '~/app/common/components/forms/choice-option';
import { FieldControl } from '~/app/common/components/forms/field-control';
import { FieldErrorComponent } from '~/app/common/components/forms/field-error/field-error.component';
import { IconComponent } from '~/app/common/components/icon/icon.component';
import { LiveAnnouncer } from '~/app/common/components/overlay/live-announcer.service';
import { OverlayPanelComponent } from '~/app/common/components/overlay/overlay-panel.component';
import { ViewportService } from '~/app/common/components/overlay/viewport.service';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';

const TYPEAHEAD_RESET_MS = 500;
/** Acima disso a lista ganha busca (quando `searchable` não foi definido). */
const AUTO_SEARCH_FROM = 8;
/** Valor interno do item "todos/nenhum" criado por `emptyLabel` (o controle fica com `null`). */
const EMPTY_VALUE = '\u0000empty';

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase();
}

/**
 * Seleção de uma opção numa lista (contas, categorias, idioma, tema, filtros): o `<select>` do
 * moneylog. Padrão "select-only combobox" do WAI-ARIA APG: o foco fica no campo e a opção ativa é
 * indicada por `aria-activedescendant`. Em tela larga a lista é um popover; no celular, uma folha
 * inferior. Com muitas opções (ou `searchable`) ganha uma busca. `emptyLabel` cria o item
 * "Todos…" que devolve `null` (filtros).
 */
@Component({
  selector: 'app-select',
  imports: [FieldErrorComponent, IconComponent, OverlayPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SelectComponent), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => SelectComponent), multi: true },
  ],
  templateUrl: './select.component.html',
  styleUrl: './select.component.css',
})
export class SelectComponent extends FieldControl<string | null> implements Validator, OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly viewport = inject(ViewportService);
  private readonly announcer = inject(LiveAnnouncer);
  protected readonly t = inject(I18nService).t;

  readonly options = input.required<readonly ChoiceOption[]>();
  readonly mandatory = input(true);
  /** Texto quando nada está escolhido (padrão: "Selecione"). */
  readonly placeholder = input<string>();
  /** Item que representa "sem valor" (ex.: "Todas as contas"); o controle fica com `null`. */
  readonly emptyLabel = input<string>();
  /** Busca na lista: `undefined` = automática (mais de 8 opções). */
  readonly searchable = input<boolean | undefined>(undefined);
  readonly size = input<'default' | 'compact'>('default');

  protected readonly value = signal<string | null>(null);
  protected readonly open = signal(false);
  protected readonly active = signal(-1);
  protected readonly query = signal('');

  private readonly trigger = viewChild.required<ElementRef<HTMLElement>>('trigger');
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('search');

  protected readonly listboxId = computed(() => `${this.controlId()}-listbox`);
  protected readonly items = computed<readonly ChoiceOption[]>(() => {
    const empty = this.emptyLabel();
    return empty ? [{ value: EMPTY_VALUE, label: empty }, ...this.options()] : this.options();
  });
  protected readonly hasSearch = computed(
    () => this.searchable() ?? this.options().length > AUTO_SEARCH_FROM,
  );
  /** Com busca, ou na folha do celular, o foco vive dentro do painel (não no campo). */
  protected readonly focusInPanel = computed(() => this.hasSearch() || this.viewport.compact());
  protected readonly visible = computed<readonly ChoiceOption[]>(() => {
    const q = normalize(this.query().trim());
    const items = this.items();
    return this.hasSearch() && q ? items.filter((o) => normalize(o.label).includes(q)) : items;
  });
  private readonly selectedValue = computed(
    () => this.value() ?? (this.emptyLabel() ? EMPTY_VALUE : null),
  );
  protected readonly selected = computed(
    () => this.items().find((option) => option.value === this.selectedValue()) ?? null,
  );
  protected readonly hasValue = computed(() => this.selected() !== null);
  protected readonly activeId = computed(() =>
    this.open() && this.active() >= 0 ? this.optionId(this.active()) : null,
  );

  private typed = '';
  private typedTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    super();
    // Mantém a opção ativa visível quando a lista rola (teclado).
    afterRenderEffect(() => {
      const id = this.activeId();
      if (!id) return;
      this.document.getElementById(id)?.scrollIntoView?.({ block: 'nearest' });
    });
    // Anuncia a quantidade de resultados ao filtrar.
    effect(() => {
      const count = this.visible().length;
      if (untracked(() => this.open()) && this.query() !== '') {
        this.announcer.announce(
          count === 0
            ? this.t().form.ui.noResults
            : interpolate(this.t().form.ui.resultsCount, { count: String(count) }),
        );
      }
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.typedTimer);
  }

  writeValue(value: string | null): void {
    this.value.set(value);
  }

  validate(): ValidationErrors | null {
    return this.mandatory() && this.value() === null ? { required: true } : null;
  }

  protected optionId(index: number): string {
    return `${this.controlId()}-option-${index}`;
  }

  protected optionCy(option: ChoiceOption): string {
    return `${this.fieldId()}-option-${option.value === EMPTY_VALUE ? 'all' : option.value}`;
  }

  protected toggle(): void {
    if (this.disabled()) return;
    if (this.open()) this.close();
    else this.show(this.selectedIndex());
  }

  protected choose(index: number): void {
    const option = this.visible()[index];
    if (!option || option.disabled) return;
    const next = option.value === EMPTY_VALUE ? null : option.value;
    if (next !== this.value()) {
      this.value.set(next);
      this.onChange(next);
    }
    this.close();
  }

  /** Fecha a lista; `restoreFocus` devolve o foco ao campo quando ele estava no painel. */
  protected close(restoreFocus = true): void {
    if (!this.open()) return;
    const inPanel = this.focusInPanel();
    this.open.set(false);
    this.query.set('');
    this.typed = '';
    if (restoreFocus && inPanel) this.trigger().nativeElement.focus({ preventScroll: true });
    this.onTouched();
  }

  protected onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.active.set(edgeEnabled(this.visible(), 'first'));
  }

  protected onBlur(): void {
    if (this.open() && this.focusInPanel()) return;
    this.close(false);
    this.onTouched();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (this.disabled()) return;
    const options = this.visible();
    const searching = event.target instanceof HTMLInputElement;
    if (!this.open()) {
      const opening: Record<string, () => number> = {
        ArrowDown: () => this.selectedIndex(),
        ArrowUp: () => this.selectedIndex(),
        Enter: () => this.selectedIndex(),
        ' ': () => this.selectedIndex(),
        Home: () => edgeEnabled(options, 'first'),
        End: () => edgeEnabled(options, 'last'),
      };
      const start = opening[event.key];
      if (start) {
        event.preventDefault();
        this.show(start());
      } else if (this.isPrintable(event) && !this.hasSearch()) {
        this.show(-1);
        this.typeahead(event.key);
      }
      return;
    }

    const current = this.active();
    switch (event.key) {
      case 'ArrowDown':
        this.active.set(
          current < 0 ? edgeEnabled(options, 'first') : nextEnabled(options, current, 1, false),
        );
        break;
      case 'ArrowUp':
        this.active.set(
          current < 0 ? edgeEnabled(options, 'last') : nextEnabled(options, current, -1, false),
        );
        break;
      case 'Home':
        if (searching) return;
        this.active.set(edgeEnabled(options, 'first'));
        break;
      case 'End':
        if (searching) return;
        this.active.set(edgeEnabled(options, 'last'));
        break;
      case 'Enter':
        if (current >= 0) this.choose(current);
        else this.close();
        break;
      case ' ':
        if (searching) return;
        if (current >= 0) this.choose(current);
        else this.close();
        break;
      case 'Escape':
        this.close();
        break;
      case 'Tab':
        // Sai do campo sem escolher: em dinheiro, nada muda sem uma ação explícita.
        if (this.focusInPanel()) this.trigger().nativeElement.focus({ preventScroll: true });
        this.close(false);
        return;
      default:
        if (!searching && this.isPrintable(event)) this.typeahead(event.key);
        return;
    }
    event.preventDefault();
  }

  private selectedIndex(): number {
    const options = this.visible();
    const index = options.findIndex((option) => option.value === this.selectedValue());
    return index >= 0 && !options[index]?.disabled ? index : edgeEnabled(options, 'first');
  }

  private show(active: number): void {
    this.query.set('');
    this.active.set(active);
    this.open.set(true);
  }

  private isPrintable(event: KeyboardEvent): boolean {
    return (
      event.key.length === 1 &&
      event.key !== ' ' &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    );
  }

  /** Busca pela digitação: vai para a próxima opção cujo rótulo começa com o que foi digitado. */
  private typeahead(key: string): void {
    clearTimeout(this.typedTimer);
    this.typed += normalize(key);
    this.typedTimer = setTimeout(() => (this.typed = ''), TYPEAHEAD_RESET_MS);
    const options = this.visible();
    const total = options.length;
    const start = this.typed.length === 1 ? this.active() + 1 : Math.max(this.active(), 0);
    for (let i = 0; i < total; i++) {
      const index = (start + i) % total;
      const option = options[index];
      if (option && !option.disabled && normalize(option.label).startsWith(this.typed)) {
        this.active.set(index);
        return;
      }
    }
  }
}
