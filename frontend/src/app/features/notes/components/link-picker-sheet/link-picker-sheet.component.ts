import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  Observable,
  of,
  startWith,
  switchMap,
} from 'rxjs';

import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { MonthPickerComponent } from '~/app/common/components/forms/month-picker/month-picker.component';
import { SelectComponent } from '~/app/common/components/forms/select/select.component';
import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { LiveAnnouncer } from '~/app/common/components/overlay/live-announcer.service';
import { SheetComponent } from '~/app/common/components/sheet/sheet.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { DisplayTextPipe } from '~/app/common/pipes/display-text.pipe';
import {
  type LinkCandidate,
  LinkTargetSearchService,
} from '~/app/features/notes/services/link-target-search.service';
import type { NoteLinkRef } from '~/modules/notes/core/types/note';
import { Problem, problemOf } from '~/util/api/problem';

type PickerType = LinkCandidate['type'] | 'MONTHLY_SUMMARY';

const TYPES: readonly PickerType[] = [
  'TRANSACTION',
  'GOAL',
  'PERSON',
  'DEBT',
  'CARD',
  'INVOICE',
  'MONTHLY_SUMMARY',
];

type ResultsState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly items: readonly LinkCandidate[] };

const ISO_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * "Vincular a um registro" (folha): escolhe o tipo (movimentação, meta, pessoa, dívida, cartão, fatura ou resumo
 * mensal) e busca o registro **pelas portas de cada módulo** (`LinkTargetSearchService`; a página injeta, os
 * módulos não se importam). A busca é um combobox (`role="combobox"` no campo, `listbox` de opções,
 * `aria-activedescendant`, setas e Enter, quantidade de resultados anunciada). Fatura: primeiro o cartão. Resumo
 * mensal: o mês. Já vinculado aparece desabilitado com a razão. O vínculo só liga; **nunca altera valores**.
 * Escopo de componente.
 */
@Component({
  selector: 'app-link-picker-sheet',
  imports: [
    DisplayTextPipe,
    ReactiveFormsModule,
    SheetComponent,
    SelectComponent,
    TextFieldComponent,
    MonthPickerComponent,
  ],
  providers: [LinkTargetSearchService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sheet
      cy="link-picker-sheet"
      [open]="open()"
      [heading]="t().notes.picker.title"
      [description]="t().notes.picker.description"
      [dismissable]="!busy()"
      (closed)="close()"
    >
      @if (open()) {
        <div class="picker" data-cy="link-picker">
          <app-select
            fieldId="picker-type"
            [options]="typeOptions()"
            [label]="t().notes.picker.typeLabel"
            [formControl]="typeControl"
          />

          @if (type() === 'MONTHLY_SUMMARY') {
            <app-month-picker
              fieldId="picker-month"
              [label]="t().notes.picker.monthLabel"
              [formControl]="monthControl"
            />
            <div class="actions">
              <button
                type="button"
                class="button button--primary"
                data-cy="picker-add-month"
                [disabled]="busy() || !monthValid()"
                (click)="chooseMonth()"
              >
                {{ t().notes.picker.add }}
              </button>
            </div>
          } @else {
            @if (type() === 'INVOICE') {
              <app-select
                fieldId="picker-card"
                [options]="cardOptions()"
                [label]="t().notes.picker.cardLabel"
                [formControl]="cardControl"
                [mandatory]="false"
                [placeholder]="t().notes.picker.chooseCardFirst"
              />
            }
            @if (type() !== 'INVOICE') {
              <app-text-field
                fieldId="picker-search"
                [label]="t().notes.picker.searchLabel"
                [placeholder]="t().notes.picker.searchPlaceholder"
                [formControl]="termControl"
                [role]="'combobox'"
                [ariaControls]="listboxId"
                [ariaExpanded]="showList()"
                [ariaActivedescendant]="activeId()"
                [mandatory]="false"
                [maxlength]="100"
                (keydown)="onKey($event)"
              />
            }

            <div class="results" aria-live="off" data-cy="picker-results">
              @switch (results().status) {
                @case ('loading') {
                  <p class="hint" role="status" data-cy="picker-loading">
                    {{ t().notes.picker.loading }}
                  </p>
                }
                @case ('error') {
                  <p class="banner" role="alert" data-cy="picker-search-error">
                    {{ t().notes.picker.error }}
                    <button type="button" class="button" data-cy="picker-retry" (click)="retry()">
                      {{ t().notes.picker.retry }}
                    </button>
                  </p>
                }
                @case ('ready') {
                  @if (items().length === 0) {
                    <p class="hint" data-cy="picker-empty">
                      {{
                        type() === 'INVOICE'
                          ? t().notes.picker.noInvoices
                          : t().notes.picker.noResults
                      }}
                    </p>
                  }
                }
              }
              <ul
                class="options"
                role="listbox"
                [id]="listboxId"
                [attr.aria-label]="t().notes.picker.resultsLabel"
                [hidden]="items().length === 0"
              >
                @for (item of items(); track item.id; let i = $index) {
                  <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -- combobox: o foco fica no campo (aria-activedescendant); as opções não entram na tabulação e o teclado é tratado no campo -->
                  <li
                    role="option"
                    class="option"
                    [id]="optionId(i)"
                    [class.is-active]="i === active()"
                    [class.is-linked]="isLinked(item)"
                    [attr.aria-selected]="i === active()"
                    [attr.aria-disabled]="isLinked(item) || null"
                    [attr.data-cy]="'picker-option-' + item.id"
                    (mousedown)="$event.preventDefault()"
                    (click)="choose(item)"
                  >
                    <span class="option__label"
                      ><bdi>{{ item.label | displayText }}</bdi></span
                    >
                    @if (isLinked(item)) {
                      <span class="option__hint">{{ t().notes.picker.alreadyLinked }}</span>
                    } @else if (item.hint) {
                      <span class="option__hint"
                        ><bdi>{{ item.hint | displayText }}</bdi></span
                      >
                    }
                  </li>
                }
              </ul>
            </div>
          }

          @if (banner(); as message) {
            <p class="banner" role="alert" data-cy="picker-error">{{ message }}</p>
          }
          <div class="actions">
            <button
              type="button"
              class="button"
              data-cy="picker-cancel"
              [disabled]="busy()"
              (click)="close()"
            >
              {{ t().notes.picker.cancel }}
            </button>
          </div>
        </div>
      }
    </app-sheet>
  `,
  styles: `
    :host {
      display: contents;
    }

    .picker,
    .results {
      display: grid;
      gap: var(--space-3);
    }

    .options {
      margin: 0;
      padding: var(--space-1);
      max-height: 16rem;
      overflow-y: auto;
      list-style: none;
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-control);
    }

    .options[hidden] {
      display: none;
    }

    .option {
      display: grid;
      gap: 2px;
      min-height: 2.75rem;
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-control);
      cursor: pointer;
    }

    .option.is-active {
      background-color: var(--color-surface-muted);
      box-shadow: inset 2px 0 0 var(--color-accent);
    }

    .option.is-linked {
      color: var(--color-text-muted);
      cursor: default;
    }

    .option__hint,
    .hint {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--text-xs);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--space-2);
    }
  `,
})
export class LinkPickerSheetComponent {
  private readonly search = inject(LinkTargetSearchService);
  private readonly announcer = inject(LiveAnnouncer);
  protected readonly t = inject(I18nService).t;

  readonly open = input.required<boolean>();
  /** Os vínculos explícitos que a nota já tem (os iguais aparecem como "já vinculada"). */
  readonly existing = input<readonly NoteLinkRef[]>([]);
  readonly busy = input(false);
  /** Falha da última tentativa (`NOTE_LINK_TARGET_NOT_FOUND`...). */
  readonly problem = input<Problem | null>(null);

  readonly closed = output<void>();
  readonly chosen = output<NoteLinkRef>();

  private static nextId = 0;
  private readonly uid = ++LinkPickerSheetComponent.nextId;
  protected readonly listboxId = `picker-options-${this.uid}`;

  protected readonly typeControl = new FormControl<string | null>('TRANSACTION');
  protected readonly termControl = new FormControl('', { nonNullable: true });
  protected readonly cardControl = new FormControl<string | null>(null);
  protected readonly monthControl = new FormControl<string | null>(null);

  protected readonly type = toSignal(this.typeControl.valueChanges, {
    initialValue: 'TRANSACTION',
  });
  private readonly term = toSignal(
    this.termControl.valueChanges.pipe(debounceTime(300), distinctUntilChanged(), startWith('')),
    { initialValue: '' },
  );
  private readonly card = toSignal(this.cardControl.valueChanges, { initialValue: null });
  private readonly month = toSignal(this.monthControl.valueChanges, { initialValue: null });
  protected readonly monthValid = computed(() => ISO_MONTH.test(this.month() ?? ''));
  private readonly reload = signal(0);

  protected readonly typeOptions = computed<readonly ChoiceOption[]>(() =>
    TYPES.map((type) => ({ value: type, label: this.t().notes.links.types[type] })),
  );

  private readonly cards = signal<readonly LinkCandidate[]>([]);
  protected readonly cardOptions = computed<readonly ChoiceOption[]>(() =>
    this.cards().map((card) => ({
      value: card.id,
      label: card.label,
      ...(card.hint ? { hint: card.hint } : {}),
    })),
  );

  protected readonly results = toSignal(
    toObservable(
      computed(() => ({
        open: this.open(),
        type: (this.type() ?? 'TRANSACTION') as PickerType,
        term: this.term(),
        card: this.card(),
        reload: this.reload(),
      })),
    ).pipe(
      switchMap((req): Observable<ResultsState> => {
        if (!req.open || req.type === 'MONTHLY_SUMMARY') return of({ status: 'idle' });
        let source: Observable<readonly LinkCandidate[]>;
        if (req.type === 'INVOICE') {
          if (!req.card) return of({ status: 'idle' });
          source = this.search.invoices(req.card);
        } else {
          source = this.search.search(req.type, req.term);
        }
        return source.pipe(
          map((items): ResultsState => ({ status: 'ready', items })),
          startWith<ResultsState>({ status: 'loading' }),
          catchError((error: unknown) =>
            of<ResultsState>({ status: 'error', problem: problemOf(error) }),
          ),
        );
      }),
    ),
    { initialValue: { status: 'idle' } as ResultsState },
  );
  protected readonly items = computed(() => {
    const state = this.results();
    return state.status === 'ready' ? state.items : [];
  });
  protected readonly showList = computed(() => this.items().length > 0);

  protected readonly active = signal(0);
  protected readonly activeId = computed(() =>
    this.showList() ? this.optionId(this.active()) : undefined,
  );
  protected readonly banner = computed(() => {
    const problem = this.problem();
    return problem ? problemMessage(problem, this.t().errors) : null;
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        this.typeControl.setValue('TRANSACTION');
        this.termControl.setValue('');
        this.cardControl.setValue(null);
        this.monthControl.setValue(null);
        this.active.set(0);
      });
    });
    // A lista de cartões só carrega quando o tipo é "Fatura".
    effect(() => {
      if (!this.open() || this.type() !== 'INVOICE') return;
      untracked(() => {
        this.search.cardOptions('', 'INVOICE').subscribe({
          next: (cards) => this.cards.set(cards),
          error: () => this.cards.set([]),
        });
      });
    });
    effect(() => {
      const state = this.results();
      untracked(() => {
        this.active.set(0);
        if (state.status === 'ready' && this.type() !== 'MONTHLY_SUMMARY') {
          this.announcer.announce(
            interpolate(this.t().notes.picker.resultsCount, { count: String(state.items.length) }),
          );
        }
      });
    });
  }

  protected optionId(index: number): string {
    return `${this.listboxId}-${index}`;
  }

  protected isLinked(item: LinkCandidate): boolean {
    return this.existing().some((link) => link.type === item.type && link.id === item.id);
  }

  protected onKey(event: KeyboardEvent): void {
    const count = this.items().length;
    if (count === 0) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.active.set((this.active() + 1) % count);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.active.set((this.active() - 1 + count) % count);
        break;
      case 'Home':
        if (this.termControl.value === '') {
          event.preventDefault();
          this.active.set(0);
        }
        break;
      case 'Enter': {
        event.preventDefault();
        const item = this.items()[this.active()];
        if (item) this.choose(item);
        break;
      }
    }
  }

  protected choose(item: LinkCandidate): void {
    if (this.busy() || this.isLinked(item)) return;
    this.chosen.emit({ type: item.type, id: item.id });
  }

  protected chooseMonth(): void {
    const key = this.monthControl.value;
    if (!this.busy() && key && ISO_MONTH.test(key)) {
      this.chosen.emit({ type: 'MONTHLY_SUMMARY', key });
    }
  }

  protected retry(): void {
    this.reload.update((n) => n + 1);
  }

  protected close(): void {
    if (!this.busy()) this.closed.emit();
  }
}
