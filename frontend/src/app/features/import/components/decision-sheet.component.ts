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
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { map, startWith } from 'rxjs';

import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { SegmentedControlComponent } from '~/app/common/components/forms/segmented-control/segmented-control.component';
import { SelectComponent } from '~/app/common/components/forms/select/select.component';
import { SwitchComponent } from '~/app/common/components/forms/switch/switch.component';
import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { MoneyComponent } from '~/app/common/components/money/money.component';
import { SheetComponent } from '~/app/common/components/sheet/sheet.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import type { ImportLine, ImportLinePatch } from '~/modules/imports/core/types/import';

const METHODS = ['CASH', 'DEBIT', 'PIX', 'TRANSFER', 'BOLETO', 'OTHER'] as const;
type Mode = 'edit' | 'force' | 'transfer' | 'installment';

/**
 * Decisão sobre uma linha (presentational), numa folha:
 * - `POSSIBLE_TRANSFER` pendente: "é transferência para a conta X" ou "é gasto/receita";
 * - `LOOKS_LIKE_INSTALLMENT`: importar como compra à vista ou ignorar (ligar a uma compra existente não
 *   existe no backend);
 * - `DUPLICATE`: "Forçar importação" (explícito);
 * - demais: editar categoria, método e descrição (e "lembrar esta categoria").
 * Devolve o corpo do `PATCH`; quem usa o envia. Categoria é obrigatória ao aceitar como gasto/receita.
 */
@Component({
  selector: 'app-decision-sheet',
  imports: [
    ReactiveFormsModule,
    SheetComponent,
    SegmentedControlComponent,
    SelectComponent,
    SwitchComponent,
    TextFieldComponent,
    MoneyComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './decision-sheet.component.html',
  styleUrl: './decision-sheet.component.css',
})
export class DecisionSheetComponent {
  protected readonly t = inject(I18nService).t;

  readonly line = input<ImportLine | null>(null);
  readonly categoryOptions = input<readonly ChoiceOption[]>([]);
  readonly accountOptions = input<readonly ChoiceOption[]>([]);
  readonly busy = input(false);
  readonly decided = output<ImportLinePatch>();
  readonly cancelled = output<void>();

  protected readonly form = new FormGroup({
    choice: new FormControl<string | null>('entry'),
    counterpart: new FormControl<string | null>(null),
    categoryId: new FormControl<string | null>(null),
    method: new FormControl<string | null>(null),
    description: new FormControl('', { nonNullable: true }),
    learn: new FormControl(false, { nonNullable: true }),
  });

  private readonly values = toSignal(
    this.form.valueChanges.pipe(
      startWith(null),
      map(() => this.form.getRawValue()),
    ),
    { initialValue: this.form.getRawValue() },
  );
  protected readonly submitted = signal(false);

  protected readonly mode = computed<Mode>(() => {
    const line = this.line();
    if (!line) return 'edit';
    if (line.status === 'DUPLICATE') return 'force';
    if (line.status === 'PENDING' && line.flags.includes('POSSIBLE_TRANSFER')) return 'transfer';
    if (line.status === 'PENDING' && line.flags.includes('LOOKS_LIKE_INSTALLMENT')) {
      return 'installment';
    }
    return 'edit';
  });

  protected readonly choiceOptions = computed<readonly ChoiceOption[]>(() => {
    const copy = this.t().imports.decision;
    return this.mode() === 'transfer'
      ? [
          { value: 'transfer', label: copy.isTransfer },
          { value: 'entry', label: copy.isEntry },
        ]
      : [
          { value: 'entry', label: copy.installmentSingle },
          { value: 'ignore', label: copy.installmentIgnore },
        ];
  });
  protected readonly methodOptions = computed<readonly ChoiceOption[]>(() =>
    METHODS.map((method) => ({ value: method, label: this.t().transactions.methods[method] })),
  );
  protected readonly choice = computed(() => this.values().choice);
  protected readonly showCategory = computed(() => {
    const mode = this.mode();
    const choice = this.choice();
    return (
      !(mode === 'transfer' && choice === 'transfer') &&
      !(mode === 'installment' && choice === 'ignore')
    );
  });
  protected readonly showCounterpart = computed(
    () => this.mode() === 'transfer' && this.choice() === 'transfer',
  );
  protected readonly missingCategory = computed(
    () => this.submitted() && this.showCategory() && !this.values().categoryId,
  );
  protected readonly missingCounterpart = computed(
    () => this.submitted() && this.showCounterpart() && !this.values().counterpart,
  );
  protected readonly title = computed(() => {
    const copy = this.t().imports.decision;
    switch (this.mode()) {
      case 'transfer':
        return copy.transferTitle;
      case 'installment':
        return copy.installmentTitle;
      default:
        return copy.title;
    }
  });
  protected readonly confirmLabel = computed(() => {
    const copy = this.t().imports.decision;
    if (this.mode() === 'force') return copy.confirmForce;
    if (this.mode() === 'installment' && this.choice() === 'ignore') {
      return this.t().imports.review.reject;
    }
    return copy.confirm;
  });

  constructor() {
    effect(() => {
      const line = this.line();
      if (!line) return;
      untracked(() => {
        this.submitted.set(false);
        this.form.reset({
          choice: 'entry',
          counterpart: null,
          categoryId: line.categoryId ?? line.suggestion?.categoryId ?? null,
          method: line.method ?? line.suggestion?.method ?? null,
          description: line.editedDescription ?? '',
          learn: false,
        });
      });
    });
  }

  protected confirm(): void {
    const line = this.line();
    if (!line || this.busy()) return;
    this.submitted.set(true);
    const v = this.form.getRawValue();
    const mode = this.mode();
    const description = v.description.trim() === '' ? undefined : v.description.trim();
    if (mode === 'installment' && v.choice === 'ignore') {
      this.decided.emit({ action: 'REJECT' });
      return;
    }
    if (mode === 'transfer' && v.choice === 'transfer') {
      if (!v.counterpart) return;
      this.decided.emit({
        action: 'ACCEPT',
        asTransferTo: v.counterpart,
        ...(description !== undefined ? { description } : {}),
      });
      return;
    }
    if (!v.categoryId) return;
    this.decided.emit({
      action: mode === 'force' ? 'FORCE' : 'ACCEPT',
      categoryId: v.categoryId,
      method: v.method,
      ...(description !== undefined ? { description } : {}),
      learn: v.learn,
    });
  }
}
