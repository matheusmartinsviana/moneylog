import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { map, startWith } from 'rxjs';

import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { NumberStepperComponent } from '~/app/common/components/forms/number-stepper/number-stepper.component';
import { SegmentedControlComponent } from '~/app/common/components/forms/segmented-control/segmented-control.component';
import { SelectComponent } from '~/app/common/components/forms/select/select.component';
import { SwitchComponent } from '~/app/common/components/forms/switch/switch.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import type { ImportMapping } from '~/modules/imports/core/types/import';

export interface MappingChange {
  /** `null` = o backend detecta as colunas (ou o mapeamento manual está incompleto). */
  readonly mapping: ImportMapping | null;
  readonly valid: boolean;
}

const DELIMITERS = { auto: null, semicolon: ';', comma: ',', tab: '\t' } as const;
type DelimiterKey = keyof typeof DELIMITERS;

/**
 * Editor do mapeamento de colunas do CSV (presentational). A pessoa conta as colunas de 1 em diante; o
 * contrato usa índices a partir de 0. Desligado, o backend detecta o formato. O mapeamento salvo da conta
 * (se houver) entra preenchido. Não há prévia das linhas aqui: o backend só lê o arquivo no envio.
 */
@Component({
  selector: 'app-mapping-editor',
  imports: [
    ReactiveFormsModule,
    NumberStepperComponent,
    SegmentedControlComponent,
    SelectComponent,
    SwitchComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="mapping" [formGroup]="form" data-cy="mapping-editor">
      <p class="mapping__note">{{ t().imports.mapping.description }}</p>
      @if (saved()) {
        <p class="mapping__note" data-cy="mapping-saved">{{ t().imports.mapping.saved }}</p>
      }
      <p class="mapping__note">{{ t().imports.mapping.noPreview }}</p>
      <app-switch
        formControlName="manual"
        fieldId="mapping-manual"
        [label]="t().imports.mapping.useMapping"
      />
      @if (manual()) {
        <p class="mapping__note">{{ t().imports.mapping.columnHint }}</p>
        <div class="mapping__grid">
          <app-number-stepper
            formControlName="date"
            fieldId="mapping-date"
            [label]="t().imports.mapping.date"
            [min]="1"
            [max]="99"
          />
          <app-number-stepper
            formControlName="description"
            fieldId="mapping-description"
            [label]="t().imports.mapping.descriptionColumn"
            [min]="1"
            [max]="99"
          />
        </div>
        <app-segmented-control
          formControlName="valueMode"
          fieldId="mapping-value-mode"
          [label]="t().imports.mapping.valueMode"
          [options]="valueModeOptions()"
        />
        <div class="mapping__grid">
          @if (form.controls.valueMode.value === 'one') {
            <app-number-stepper
              formControlName="amount"
              fieldId="mapping-amount"
              [label]="t().imports.mapping.amount"
              [min]="1"
              [max]="99"
            />
          } @else {
            <app-number-stepper
              formControlName="debit"
              fieldId="mapping-debit"
              [label]="t().imports.mapping.debit"
              [min]="1"
              [max]="99"
            />
            <app-number-stepper
              formControlName="credit"
              fieldId="mapping-credit"
              [label]="t().imports.mapping.credit"
              [min]="1"
              [max]="99"
            />
          }
        </div>
        <app-switch
          formControlName="invert"
          fieldId="mapping-invert"
          [label]="t().imports.mapping.invert"
          [hint]="t().imports.mapping.invertHint"
        />
        <app-switch
          formControlName="hasHeader"
          fieldId="mapping-has-header"
          [label]="t().imports.mapping.hasHeader"
        />
        <app-select
          formControlName="delimiter"
          fieldId="mapping-delimiter"
          [label]="t().imports.mapping.delimiter"
          [options]="delimiterOptions()"
        />
        @if (!valid()) {
          <p class="mapping__error" role="alert" data-cy="mapping-invalid">
            {{ t().imports.mapping.invalid }}
          </p>
        }
      }
    </form>
  `,
  styles: `
    .mapping {
      display: grid;
      gap: var(--space-3);
    }

    .mapping__note {
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .mapping__error {
      color: var(--color-risk);
      font-size: var(--text-sm);
    }

    .mapping__grid {
      display: grid;
      gap: var(--space-3);
    }

    @media (width >= 640px) {
      .mapping__grid {
        grid-template-columns: 1fr 1fr;
      }
    }
  `,
})
export class MappingEditorComponent {
  protected readonly t = inject(I18nService).t;

  /** Mapeamento salvo da conta/cartão (preenche o formulário). */
  readonly saved = input<ImportMapping | null>(null);
  readonly changed = output<MappingChange>();

  protected readonly form = new FormGroup({
    manual: new FormControl(false, { nonNullable: true }),
    date: new FormControl<number | null>(1),
    description: new FormControl<number | null>(2),
    valueMode: new FormControl<string | null>('one'),
    amount: new FormControl<number | null>(3),
    debit: new FormControl<number | null>(null),
    credit: new FormControl<number | null>(null),
    invert: new FormControl(false, { nonNullable: true }),
    hasHeader: new FormControl(true, { nonNullable: true }),
    delimiter: new FormControl<string | null>('auto'),
  });

  private readonly value = toSignal(
    this.form.valueChanges.pipe(
      startWith(null),
      map(() => this.form.getRawValue()),
    ),
    { initialValue: this.form.getRawValue() },
  );
  protected readonly manual = computed(() => this.value().manual);

  private readonly result = computed<MappingChange>(() => {
    const v = this.value();
    if (!v.manual) return { mapping: null, valid: true };
    const index = (n: number | null) => (n !== null && n >= 1 ? n - 1 : null);
    const date = index(v.date);
    const description = index(v.description);
    const one = v.valueMode !== 'two';
    const amount = one ? index(v.amount) : null;
    const debit = one ? null : index(v.debit);
    const credit = one ? null : index(v.credit);
    const hasValue = one ? amount !== null : debit !== null || credit !== null;
    if (date === null || description === null || !hasValue) return { mapping: null, valid: false };
    const key = (v.delimiter ?? 'auto') as DelimiterKey;
    return {
      mapping: {
        date,
        description,
        amount,
        debit,
        credit,
        invert: v.invert,
        hasHeader: v.hasHeader,
        delimiter: DELIMITERS[key] ?? null,
      },
      valid: true,
    };
  });
  protected readonly valid = computed(() => this.result().valid);

  protected readonly valueModeOptions = computed<readonly ChoiceOption[]>(() => [
    { value: 'one', label: this.t().imports.mapping.oneColumn },
    { value: 'two', label: this.t().imports.mapping.twoColumns },
  ]);
  protected readonly delimiterOptions = computed<readonly ChoiceOption[]>(() => [
    { value: 'auto', label: this.t().imports.mapping.delimiterAuto },
    { value: 'semicolon', label: this.t().imports.mapping.delimiterSemicolon },
    { value: 'comma', label: this.t().imports.mapping.delimiterComma },
    { value: 'tab', label: this.t().imports.mapping.delimiterTab },
  ]);

  constructor() {
    // Mapeamento salvo → preenche e liga o modo manual.
    effect(() => {
      const saved = this.saved();
      if (!saved) return;
      untracked(() => {
        const delimiter =
          (Object.entries(DELIMITERS).find(([, char]) => char === saved.delimiter)?.[0] as
            DelimiterKey | undefined) ?? 'auto';
        this.form.setValue({
          manual: true,
          date: saved.date + 1,
          description: saved.description + 1,
          valueMode: saved.amount !== null ? 'one' : 'two',
          amount: saved.amount !== null ? saved.amount + 1 : null,
          debit: saved.debit !== null ? saved.debit + 1 : null,
          credit: saved.credit !== null ? saved.credit + 1 : null,
          invert: saved.invert,
          hasHeader: saved.hasHeader,
          delimiter,
        });
      });
    });
    effect(() => {
      const result = this.result();
      untracked(() => this.changed.emit(result));
    });
    this.form.controls.valueMode.valueChanges.pipe(takeUntilDestroyed()).subscribe((mode) => {
      if (mode === 'two' && this.form.controls.debit.value === null) {
        this.form.patchValue({ debit: 3 }, { emitEvent: true });
      }
    });
  }
}
