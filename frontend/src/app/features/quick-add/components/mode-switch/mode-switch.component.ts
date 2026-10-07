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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { SegmentedControlComponent } from '~/app/common/components/forms/segmented-control/segmented-control.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import {
  MAIN_MODES,
  MORE_MODES,
  PEOPLE_MODES,
  QUICK_ADD_MODES,
  QuickAddMode,
} from '~/app/features/quick-add/quick-add-mode';

/**
 * Seletor de modo do `/quick-add` (presentational): Despesa · Pix · Débito · Receita · Transferência
 * · Crédito e, em "Mais tipos", Aplicação ou resgate · Ajuste · Reembolso. "Crédito" (compra no cartão) está
 * habilitado desde a Etapa 3 (S-132).
 */
@Component({
  selector: 'app-mode-switch',
  imports: [ReactiveFormsModule, SegmentedControlComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mode-switch.component.html',
  styleUrl: './mode-switch.component.css',
})
export class ModeSwitchComponent {
  protected readonly t = inject(I18nService).t;

  readonly mode = input.required<QuickAddMode>();
  readonly modeChange = output<QuickAddMode>();

  protected readonly main = new FormControl<string | null>(null);
  protected readonly more = new FormControl<string | null>(null);
  protected readonly people = new FormControl<string | null>(null);
  protected readonly moreOpen = signal(false);
  protected readonly peopleOpen = signal(false);

  protected readonly mainOptions = computed<readonly ChoiceOption[]>(() => {
    const modes = this.t().quickAdd.modes;
    return MAIN_MODES.map((mode) => ({ value: mode, label: modes[mode] }));
  });
  protected readonly moreOptions = computed<readonly ChoiceOption[]>(() => {
    const modes = this.t().quickAdd.modes;
    return MORE_MODES.map((mode) => ({ value: mode, label: modes[mode] }));
  });

  protected readonly peopleOptions = computed<readonly ChoiceOption[]>(() => {
    const modes = this.t().quickAdd.modes;
    return PEOPLE_MODES.map((mode) => ({ value: mode, label: modes[mode] }));
  });

  constructor() {
    effect(() => {
      const mode = this.mode();
      untracked(() => {
        const isMore = (MORE_MODES as readonly string[]).includes(mode);
        const isPeople = (PEOPLE_MODES as readonly string[]).includes(mode);
        this.main.setValue(isMore || isPeople ? null : mode, { emitEvent: false });
        this.more.setValue(isMore ? mode : null, { emitEvent: false });
        this.people.setValue(isPeople ? mode : null, { emitEvent: false });
        if (isMore) this.moreOpen.set(true);
        if (isPeople) this.peopleOpen.set(true);
      });
    });
    this.main.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.more.setValue(null, { emitEvent: false });
      this.people.setValue(null, { emitEvent: false });
      this.emit(value);
    });
    this.more.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.main.setValue(null, { emitEvent: false });
      this.people.setValue(null, { emitEvent: false });
      this.emit(value);
    });
    this.people.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.main.setValue(null, { emitEvent: false });
      this.more.setValue(null, { emitEvent: false });
      this.emit(value);
    });
  }

  protected toggleMore(): void {
    this.moreOpen.update((open) => !open);
  }

  protected togglePeople(): void {
    this.peopleOpen.update((open) => !open);
  }

  private emit(value: string | null): void {
    const mode = QUICK_ADD_MODES.find((candidate) => candidate === value);
    if (mode) this.modeChange.emit(mode);
  }
}
