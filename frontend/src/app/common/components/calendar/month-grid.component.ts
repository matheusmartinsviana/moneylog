import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  untracked,
  effect,
} from '@angular/core';

import { addMonthsToMonth } from '~/app/common/components/calendar/calendar-math';
import { IconComponent } from '~/app/common/components/icon/icon.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';

/**
 * Grade de meses de um ano (`YYYY-MM`), com navegação de ano. Usada pelo `MonthPicker` e pela troca
 * de mês/ano do calendário. Teclado: setas (±1 mês, ±3 meses), Home/End (início/fim do ano),
 * PageUp/PageDown (ano), Enter/Espaço escolhe. Roving tabindex.
 */
@Component({
  selector: 'app-month-grid',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="months" [attr.data-cy]="cy()">
      <div class="months__head">
        <button
          type="button"
          class="months__nav"
          [attr.aria-label]="t().form.date.previousYear"
          [attr.data-cy]="cy() + '-prev-year'"
          [disabled]="!canShift(-12)"
          (click)="shift(-12)"
        >
          <app-icon name="chevronLeft" [size]="18" />
        </button>
        <span class="months__year num" aria-live="polite" [attr.data-cy]="cy() + '-year'">{{
          year()
        }}</span>
        <button
          type="button"
          class="months__nav"
          [attr.aria-label]="t().form.date.nextYear"
          [attr.data-cy]="cy() + '-next-year'"
          [disabled]="!canShift(12)"
          (click)="shift(12)"
        >
          <app-icon name="chevronRight" [size]="18" />
        </button>
      </div>
      <div class="months__grid" role="group" [attr.aria-label]="t().form.date.chooseMonth">
        @for (item of items(); track item.month) {
          <button
            type="button"
            class="months__cell"
            [class.is-selected]="item.month === value()"
            [class.is-today]="item.month === today()"
            [attr.aria-pressed]="item.month === value()"
            [attr.aria-current]="item.month === today() ? 'date' : null"
            [attr.aria-disabled]="item.disabled || null"
            [attr.data-month]="item.month"
            [attr.data-cy]="cy() + '-' + item.month"
            [tabIndex]="item.month === focused() ? 0 : -1"
            (click)="pick(item.month, item.disabled)"
            (keydown)="onKeydown($event)"
          >
            {{ item.label }}
          </button>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .months {
      display: grid;
      gap: var(--space-2);
      padding: var(--space-3);
    }

    .months__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .months__year {
      font-weight: var(--weight-semibold);
    }

    .months__nav {
      display: inline-grid;
      place-items: center;
      width: 2.75rem;
      height: 2.75rem;
      border: 0;
      border-radius: var(--radius-control);
      background: transparent;
      color: var(--color-text-muted);
    }

    .months__nav:hover:not(:disabled) {
      background-color: var(--color-surface-muted);
      color: var(--color-text);
    }

    .months__nav:disabled {
      opacity: 0.4;
    }

    .months__grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--space-1);
    }

    .months__cell {
      min-height: 2.75rem;
      border: var(--border-width) solid transparent;
      border-radius: var(--radius-control);
      background: transparent;
      color: var(--color-text);
      font-size: var(--text-md);
      text-transform: capitalize;
      transition: background-color var(--duration-fast) var(--ease-standard);
    }

    .months__cell:hover:not([aria-disabled='true']) {
      background-color: var(--color-surface-muted);
    }

    .months__cell.is-today {
      border-color: var(--color-border);
    }

    .months__cell.is-selected {
      background-color: var(--color-accent);
      color: var(--color-on-accent);
      font-weight: var(--weight-medium);
    }

    .months__cell[aria-disabled='true'] {
      color: var(--color-text-muted);
      opacity: 0.45;
      cursor: not-allowed;
    }
  `,
})
export class MonthGridComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  /** Mês escolhido (`YYYY-MM`). */
  readonly value = input<string | null>(null);
  /** Mês de "hoje" (`YYYY-MM`). */
  readonly today = input<string | null>(null);
  readonly min = input('2000-01');
  readonly max = input('2100-12');
  readonly cy = input('month-grid');
  /** Mês em que a grade abre (padrão: o escolhido ou hoje). */
  readonly start = input<string | null>(null);

  readonly picked = output<string>();

  protected readonly focused = signal('2026-01');
  protected readonly year = computed(() => this.focused().slice(0, 4));

  private readonly formatter = computed(
    () =>
      new Intl.DateTimeFormat(HTML_LANG[this.i18n.language()], { month: 'short', timeZone: 'UTC' }),
  );

  protected readonly items = computed(() => {
    const year = this.year();
    const fmt = this.formatter();
    return Array.from({ length: 12 }, (_, i) => {
      const month = `${year}-${String(i + 1).padStart(2, '0')}`;
      return {
        month,
        label: fmt.format(new Date(Date.UTC(Number(year), i, 1))).replace(/\.$/, ''),
        disabled: month < this.min() || month > this.max(),
      };
    });
  });

  constructor() {
    effect(() => {
      const initial = this.start() ?? this.value() ?? this.today() ?? '2026-01';
      untracked(() => this.focused.set(this.clamp(initial)));
    });
  }

  /** Foca o mês atual da grade (chamado pelo painel ao abrir). */
  focusGrid(): void {
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector<HTMLElement>(`[data-month="${this.focused()}"]`)
          ?.focus({ preventScroll: true }),
      { injector: this.injector },
    );
  }

  protected canShift(months: number): boolean {
    const next = addMonthsToMonth(this.focused(), months);
    return months < 0
      ? next.slice(0, 4) >= this.min().slice(0, 4)
      : next.slice(0, 4) <= this.max().slice(0, 4);
  }

  protected shift(months: number): void {
    this.focused.set(this.clamp(addMonthsToMonth(this.focused(), months)));
  }

  protected pick(month: string, disabled: boolean): void {
    if (!disabled) this.picked.emit(month);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -3,
      ArrowDown: 3,
      PageUp: -12,
      PageDown: 12,
    };
    const current = this.focused();
    let next: string | null = null;
    if (event.key in steps) next = addMonthsToMonth(current, steps[event.key] ?? 0);
    else if (event.key === 'Home') next = `${current.slice(0, 4)}-01`;
    else if (event.key === 'End') next = `${current.slice(0, 4)}-12`;
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.pick(current, current < this.min() || current > this.max());
      return;
    }
    if (next === null) return;
    event.preventDefault();
    this.focused.set(this.clamp(next));
    this.focusGrid();
  }

  private clamp(month: string): string {
    return month < this.min() ? this.min() : month > this.max() ? this.max() : month;
  }
}
