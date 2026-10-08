import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';

import {
  addDays,
  addMonths,
  clampIso,
  daysInMonth,
  MAX_DATE,
  MIN_DATE,
  monthGrid,
  weekStart,
} from '~/app/common/components/calendar/calendar-math';
import { MonthGridComponent } from '~/app/common/components/calendar/month-grid.component';
import { IconComponent } from '~/app/common/components/icon/icon.component';
import { LiveAnnouncer } from '~/app/common/components/overlay/live-announcer.service';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';

/**
 * Calendário de um mês (padrão "date picker dialog" do APG): grade `role="grid"` com roving tabindex.
 * Setas movem 1 dia/1 semana, Home/End início/fim da semana, PageUp/PageDown mês, Shift+PageUp/Down
 * ano, Enter/Espaço escolhe. Dias fora de `min`/`max` ficam desabilitados. Cabeçalho com mês
 * anterior/seguinte e troca de mês e ano. Só emite a data escolhida (`YYYY-MM-DD`).
 */
@Component({
  selector: 'app-calendar',
  imports: [IconComponent, MonthGridComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cal" [attr.data-cy]="cy()">
      @if (monthsView()) {
        <app-month-grid
          [value]="focused().slice(0, 7)"
          [today]="today().slice(0, 7)"
          [min]="min().slice(0, 7)"
          [max]="max().slice(0, 7)"
          [cy]="cy() + '-months'"
          (picked)="onMonth($event)"
        />
      } @else {
        <div class="cal__head">
          <button
            type="button"
            class="cal__nav"
            [attr.aria-label]="t().form.date.previousMonth"
            [attr.data-cy]="cy() + '-prev'"
            [disabled]="!canMove(-1)"
            (click)="moveMonth(-1)"
          >
            <app-icon name="chevronLeft" [size]="18" />
          </button>
          <button
            type="button"
            class="cal__title"
            [attr.aria-label]="titleLabel()"
            [attr.data-cy]="cy() + '-title'"
            (click)="openMonths()"
          >
            <span class="cal__title-text">{{ title() }}</span>
            <app-icon name="chevronDown" [size]="16" />
          </button>
          <button
            type="button"
            class="cal__nav"
            [attr.aria-label]="t().form.date.nextMonth"
            [attr.data-cy]="cy() + '-next'"
            [disabled]="!canMove(1)"
            (click)="moveMonth(1)"
          >
            <app-icon name="chevronRight" [size]="18" />
          </button>
        </div>
        <table class="cal__grid" role="grid" [attr.aria-label]="calendarLabel()">
          <thead>
            <tr>
              @for (day of weekdays(); track $index) {
                <th class="cal__weekday" scope="col" [attr.abbr]="day.long">{{ day.short }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (week of weeks(); track $index) {
              <tr>
                @for (iso of week; track $index) {
                  <td
                    class="cal__cell"
                    role="gridcell"
                    [attr.aria-selected]="iso && iso === value() ? 'true' : null"
                  >
                    @if (iso) {
                      <button
                        type="button"
                        class="cal__day num"
                        [class.is-selected]="iso === value()"
                        [class.is-today]="iso === today()"
                        [attr.aria-label]="dayLabel(iso)"
                        [attr.aria-current]="iso === today() ? 'date' : null"
                        [attr.aria-disabled]="isDisabled(iso) || null"
                        [attr.data-iso]="iso"
                        [attr.data-cy]="cy() + '-day-' + iso"
                        [tabIndex]="iso === focused() ? 0 : -1"
                        (click)="pick(iso)"
                        (keydown)="onKeydown($event)"
                      >
                        {{ dayNumber(iso) }}
                      </button>
                    }
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .cal {
      padding: var(--space-3);
    }

    .cal__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-1);
      margin-bottom: var(--space-2);
    }

    .cal__nav {
      display: inline-grid;
      place-items: center;
      width: 2.75rem;
      height: 2.75rem;
      border: 0;
      border-radius: var(--radius-control);
      background: transparent;
      color: var(--color-text-muted);
    }

    .cal__nav:hover:not(:disabled) {
      background-color: var(--color-hover-soft);
      color: var(--color-text);
    }

    .cal__nav:disabled {
      opacity: 0.4;
    }

    .cal__title {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      min-height: 2.75rem;
      padding: 0 var(--space-3);
      border: 0;
      border-radius: var(--radius-control);
      background: transparent;
      color: var(--color-text);
      font-weight: var(--weight-semibold);
    }

    .cal__title-text {
      display: inline-block;
    }

    .cal__title-text::first-letter {
      text-transform: uppercase;
    }

    .cal__title:hover {
      background-color: var(--color-hover-soft);
    }

    .cal__grid {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      table-layout: fixed;
    }

    .cal__weekday {
      padding-bottom: var(--space-1);
      color: var(--color-text-muted);
      font-size: var(--text-xs);
      font-weight: var(--weight-medium);
      text-align: center;
      text-transform: capitalize;
    }

    .cal__cell {
      padding: 1px;
      text-align: center;
    }

    .cal__day {
      width: 100%;
      min-width: 2.25rem;
      min-height: 2.75rem;
      padding: 0;
      border: var(--border-width) solid transparent;
      border-radius: var(--radius-control);
      background: transparent;
      color: var(--color-text);
      font-size: var(--text-md);
      transition: background-color var(--duration-fast) var(--ease-standard);
    }

    .cal__day:hover:not([aria-disabled='true']) {
      background-color: var(--color-hover-soft);
    }

    .cal__day.is-today {
      border-color: var(--color-text-muted);
    }

    .cal__day.is-selected {
      border-color: var(--color-accent);
      background-color: var(--color-accent);
      color: var(--color-on-accent);
      font-weight: var(--weight-medium);
    }

    .cal__day[aria-disabled='true'] {
      color: var(--color-text-muted);
      opacity: 0.4;
      cursor: not-allowed;
    }

    @media (width >= 641px) {
      .cal__day {
        min-height: 2.5rem;
      }
    }
  `,
})
export class CalendarComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  /** Data escolhida (`YYYY-MM-DD`). */
  readonly value = input<string | null>(null);
  /** "Hoje" no fuso do usuário (`YYYY-MM-DD`). */
  readonly today = input.required<string>();
  readonly min = input(MIN_DATE);
  readonly max = input(MAX_DATE);
  readonly cy = input('calendar');

  readonly picked = output<string>();

  protected readonly focused = signal('2026-01-01');
  protected readonly monthsView = signal(false);

  private readonly locale = computed(() => HTML_LANG[this.i18n.language()]);
  protected readonly month = computed(() => this.focused().slice(0, 7));
  protected readonly weeks = computed(() =>
    monthGrid(this.month(), weekStart(this.i18n.language())),
  );
  protected readonly title = computed(() =>
    new Intl.DateTimeFormat(this.locale(), {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${this.month()}-01T00:00:00Z`)),
  );
  protected readonly weekdays = computed(() => {
    const start = weekStart(this.i18n.language());
    const short = new Intl.DateTimeFormat(this.locale(), { weekday: 'narrow', timeZone: 'UTC' });
    const long = new Intl.DateTimeFormat(this.locale(), { weekday: 'long', timeZone: 'UTC' });
    // 2026-10-04 é domingo.
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(Date.UTC(2026, 9, 4 + ((start + i) % 7)));
      return { short: short.format(date), long: long.format(date) };
    });
  });
  protected readonly calendarLabel = computed(() =>
    interpolate(this.t().form.date.calendarOf, { month: this.title() }),
  );
  protected readonly titleLabel = computed(() =>
    interpolate(this.t().form.date.chooseMonthYearNamed, { month: this.title() }),
  );
  private readonly dayFormatter = computed(
    () =>
      new Intl.DateTimeFormat(this.locale(), {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }),
  );

  constructor() {
    effect(() => {
      const initial = this.value() ?? this.today();
      untracked(() => {
        this.focused.set(clampIso(initial, this.min(), this.max()));
        this.monthsView.set(false);
      });
    });
  }

  /** Foca o dia em foco da grade (ao abrir o painel). */
  focusGrid(): void {
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector<HTMLElement>(`[data-iso="${this.focused()}"]`)
          ?.focus({ preventScroll: true }),
      { injector: this.injector },
    );
  }

  protected dayLabel(iso: string): string {
    return this.dayFormatter().format(new Date(`${iso}T00:00:00Z`));
  }

  protected dayNumber(iso: string): number {
    return Number(iso.slice(8));
  }

  protected isDisabled(iso: string): boolean {
    return iso < this.min() || iso > this.max();
  }

  protected canMove(months: number): boolean {
    const first = `${this.month()}-01`;
    return months < 0 ? addDays(first, -1) >= this.min() : addMonths(first, 1) <= this.max();
  }

  protected moveMonth(months: number): void {
    this.setFocused(addMonths(this.focused(), months), false);
  }

  protected openMonths(): void {
    this.monthsView.set(true);
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector<HTMLElement>('app-month-grid [tabindex="0"]')
          ?.focus({ preventScroll: true }),
      { injector: this.injector },
    );
  }

  protected onMonth(month: string): void {
    const [year, monthNumber] = month.split('-').map(Number) as [number, number];
    const day = Math.min(Number(this.focused().slice(8)), daysInMonth(year, monthNumber));
    this.setFocused(`${month}-${String(day).padStart(2, '0')}`, false);
    this.monthsView.set(false);
    this.focusGrid();
  }

  protected pick(iso: string): void {
    if (!this.isDisabled(iso)) this.picked.emit(iso);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const current = this.focused();
    const start = weekStart(this.i18n.language());
    const dayOfWeek = (new Date(`${current}T00:00:00Z`).getUTCDay() - start + 7) % 7;
    let next: string;
    switch (event.key) {
      case 'ArrowLeft':
        next = addDays(current, -1);
        break;
      case 'ArrowRight':
        next = addDays(current, 1);
        break;
      case 'ArrowUp':
        next = addDays(current, -7);
        break;
      case 'ArrowDown':
        next = addDays(current, 7);
        break;
      case 'Home':
        next = addDays(current, -dayOfWeek);
        break;
      case 'End':
        next = addDays(current, 6 - dayOfWeek);
        break;
      case 'PageUp':
        next = addMonths(current, event.shiftKey ? -12 : -1);
        break;
      case 'PageDown':
        next = addMonths(current, event.shiftKey ? 12 : 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.pick(current);
        return;
      default:
        return;
    }
    event.preventDefault();
    this.setFocused(next, true);
  }

  private setFocused(iso: string, focus: boolean): void {
    const previousMonth = this.month();
    const next = clampIso(iso, this.min(), this.max());
    this.focused.set(next);
    if (next.slice(0, 7) !== previousMonth) {
      this.announcer.announce(this.title());
    }
    if (focus) this.focusGrid();
  }
}
