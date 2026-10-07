import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';

import { ChipComponent } from '~/app/common/components/chip/chip.component';
import { ConfirmDialogComponent } from '~/app/common/components/confirm-dialog/confirm-dialog.component';
import { DialogComponent } from '~/app/common/components/dialog/dialog.component';
import { DisclosureComponent } from '~/app/common/components/disclosure/disclosure.component';
import { EmptyStateComponent } from '~/app/common/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import { CheckboxComponent } from '~/app/common/components/forms/checkbox/checkbox.component';
import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { DatePickerComponent } from '~/app/common/components/forms/date-picker/date-picker.component';
import { FilePickerComponent } from '~/app/common/components/forms/file-picker/file-picker.component';
import { MoneyInputComponent } from '~/app/common/components/forms/money-input/money-input.component';
import { MonthPickerComponent } from '~/app/common/components/forms/month-picker/month-picker.component';
import { NumberStepperComponent } from '~/app/common/components/forms/number-stepper/number-stepper.component';
import { RadioGroupComponent } from '~/app/common/components/forms/radio-group/radio-group.component';
import { SegmentedControlComponent } from '~/app/common/components/forms/segmented-control/segmented-control.component';
import { SelectComponent } from '~/app/common/components/forms/select/select.component';
import { SwitchComponent } from '~/app/common/components/forms/switch/switch.component';
import { TextAreaComponent } from '~/app/common/components/forms/text-area/text-area.component';
import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { MenuComponent, type MenuItem } from '~/app/common/components/menu/menu.component';
import { ProgressBarComponent } from '~/app/common/components/progress-bar/progress-bar.component';
import { SheetComponent } from '~/app/common/components/sheet/sheet.component';
import { TabPanelDirective } from '~/app/common/components/tabs/tab-panel.directive';
import { type TabItem, TabsComponent } from '~/app/common/components/tabs/tabs.component';
import { TooltipDirective } from '~/app/common/components/tooltip/tooltip.directive';
import { ToastService } from '~/app/common/services/toast.service';
import { UiKitChartsComponent } from '~/app/features/dev/ui-kit/ui-kit-charts.component';

/** Controle já "tocado" (mostra o erro de validação) ou desabilitado, para as colunas do UI Kit. */
function control<T>(value: T, state: { disabled?: boolean; touched?: boolean } = {}) {
  const c = new FormControl<T>({ value, disabled: state.disabled ?? false });
  if (state.touched) c.markAsTouched();
  return c;
}

/** Controle com `required`: já tocado e vazio, mostra o erro de verdade. */
function withRequired<T>(c: FormControl<T>): FormControl<T> {
  c.addValidators(Validators.required);
  c.updateValueAndValidity();
  return c;
}

const FEW: readonly ChoiceOption[] = [
  { value: 'pix', label: 'Pix' },
  { value: 'debit', label: 'Débito' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'credit', label: 'Crédito', disabled: true, hint: 'em breve' },
];
const MANY: readonly ChoiceOption[] = Array.from({ length: 24 }, (_, i) => ({
  value: `account-${i + 1}`,
  label: `Conta corrente com um nome bem comprido número ${i + 1}`,
  hint: `R$ ${(i + 1) * 123},45`,
}));
const SEGMENTS: readonly ChoiceOption[] = [
  { value: 'EXPENSE', label: 'Despesa' },
  { value: 'INCOME', label: 'Receita' },
  { value: 'TRANSFER', label: 'Transferência' },
];
const PAYMENTS: readonly ChoiceOption[] = [
  { value: 'full', label: 'Fatura total', hint: 'Paga tudo de uma vez, sem juros.' },
  { value: 'min', label: 'Valor mínimo', hint: 'O resto vai para a próxima fatura.' },
  { value: 'later', label: 'Mais tarde', hint: 'Em breve', disabled: true },
  { value: 'custom', label: 'Outro valor' },
];
const MENU_ITEMS: readonly MenuItem[] = [
  { id: 'pay', label: 'Pagar fatura' },
  { id: 'export', label: 'Exportar' },
  { id: 'locked', label: 'Fatura fechada', disabled: true },
  { id: 'archive', label: 'Arquivar cartão', destructive: true },
];
const TABS: readonly TabItem[] = [
  { id: 'invoice', label: 'Fatura' },
  { id: 'limit', label: 'Limite' },
  { id: 'blocked', label: 'Bloqueada', disabled: true },
  { id: 'history', label: 'Histórico' },
];
const MANY_TABS: readonly TabItem[] = Array.from({ length: 10 }, (_, i) => ({
  id: `t${i + 1}`,
  label: `Cartão número ${i + 1}`,
}));
const LONG =
  'Um texto bem comprido para conferir o corte, a quebra de linha e o espaço do campo quando o conteúdo passa do que cabe';

/**
 * Matriz de estados (padrão, foco, desabilitado, erro, cheio, vazio) de cada componente de base num
 * único tema (`data-theme-scope`). O foco é desenhado com o anel de foco do token (`.kit-focus`),
 * porque `:focus-visible` não pode ficar ligado em dezenas de campos ao mesmo tempo; o foco real
 * (teclado) é conferido nos testes e2e e no botão "Focar" de cada coluna.
 * Só existe nos builds de desenvolvimento/mock (`config/dev-routes.dev.ts`).
 */
@Component({
  selector: 'app-ui-kit-matrix',
  imports: [
    ReactiveFormsModule,
    CheckboxComponent,
    ChipComponent,
    ConfirmDialogComponent,
    DatePickerComponent,
    DialogComponent,
    MenuComponent,
    NumberStepperComponent,
    ProgressBarComponent,
    RadioGroupComponent,
    SheetComponent,
    TabPanelDirective,
    UiKitChartsComponent,
    TabsComponent,
    DisclosureComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    FilePickerComponent,
    MoneyInputComponent,
    MonthPickerComponent,
    SegmentedControlComponent,
    SelectComponent,
    SwitchComponent,
    TextAreaComponent,
    TextFieldComponent,
    TooltipDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ui-kit-matrix.component.html',
  styleUrl: './ui-kit-matrix.component.css',
})
export class UiKitMatrixComponent {
  private readonly toast = inject(ToastService);

  /** Tema mostrado nesta matriz. */
  readonly scope = input.required<'light' | 'dark'>();

  protected readonly few = FEW;
  protected readonly many = MANY;
  protected readonly segments = SEGMENTS;
  protected readonly long = LONG;
  protected readonly payments = PAYMENTS;
  protected readonly menuItems = MENU_ITEMS;
  protected readonly tabs = TABS;
  protected readonly manyTabs = MANY_TABS;
  protected readonly installmentsText = (n: number): string =>
    n === 1 ? '1 parcela' : `${n} parcelas`;
  protected readonly dayText = (n: number): string => `dia ${n}`;

  // Select
  protected readonly selectDefault = control<string | null>('pix');
  protected readonly selectDisabled = control<string | null>('pix', { disabled: true });
  protected readonly selectError = control<string | null>(null, { touched: true });
  protected readonly selectFull = control<string | null>('account-17');
  protected readonly selectEmpty = control<string | null>(null);
  // TextField
  protected readonly textDefault = control<string | null>('Mercado');
  protected readonly textDisabled = control<string | null>('Mercado', { disabled: true });
  protected readonly textError = control<string | null>('', { touched: true });
  protected readonly textFull = control<string | null>(LONG);
  protected readonly textEmpty = control<string | null>('');
  // TextArea
  protected readonly areaDefault = control<string | null>(
    '# Revisão de outubro\n\nComprei o [[MacBook]].',
  );
  protected readonly areaDisabled = control<string | null>('Texto bloqueado', { disabled: true });
  protected readonly areaError = withRequired(control<string | null>('', { touched: true }));
  protected readonly areaFull = control<string | null>(`${LONG}\n${LONG}\n${LONG}`);
  protected readonly areaEmpty = control<string | null>('');
  // FilePicker
  protected readonly fileEmpty = control<File | null>(null);
  protected readonly fileChosen = control<File | null>(
    new File([new Uint8Array(1536)], 'moneylog-vault.zip'),
  );
  protected readonly fileDisabled = control<File | null>(null, { disabled: true });
  protected readonly fileError = withRequired(control<File | null>(null, { touched: true }));
  // Chip
  protected readonly chipOn = signal(true);
  protected readonly chipOff = signal(false);
  protected readonly chipRemoved = signal(false);
  // MoneyInput
  protected readonly moneyDefault = control<string | null>('1234.56');
  protected readonly moneyDisabled = control<string | null>('1234.56', { disabled: true });
  protected readonly moneyError = control<string | null>('', { touched: true });
  protected readonly moneyFull = control<string | null>('9999999.99');
  protected readonly moneyEmpty = control<string | null>('');
  // DatePicker
  protected readonly dateDefault = control<string | null>('2026-10-05');
  protected readonly dateDisabled = control<string | null>('2026-10-05', { disabled: true });
  protected readonly dateError = control<string | null>('1999-01-01', { touched: true });
  protected readonly dateFull = control<string | null>('2100-12-31');
  protected readonly dateEmpty = control<string | null>(null);
  // MonthPicker
  protected readonly monthDefault = control<string | null>('2026-10');
  protected readonly monthDisabled = control<string | null>('2026-10', { disabled: true });
  protected readonly monthError = control<string | null>(null, { touched: true });
  protected readonly monthFull = control<string | null>('2100-12');
  protected readonly monthEmpty = control<string | null>(null);
  // SegmentedControl
  protected readonly segDefault = control<string | null>('EXPENSE');
  protected readonly segDisabled = control<string | null>('EXPENSE', { disabled: true });
  protected readonly segError = control<string | null>(null, { touched: true });
  protected readonly segEmpty = control<string | null>(null);
  // RadioGroup
  protected readonly radioDefault = control<string | null>('full');
  protected readonly radioDisabled = control<string | null>('min', { disabled: true });
  protected readonly radioError = control<string | null>(null, { touched: true });
  protected readonly radioEmpty = control<string | null>(null);
  // NumberStepper
  protected readonly stepDefault = control<number | null>(6);
  protected readonly stepDisabled = control<number | null>(6, { disabled: true });
  protected readonly stepError = control<number | null>(null, { touched: true });
  protected readonly stepFull = control<number | null>(36);
  protected readonly stepEmpty = control<number | null>(null);
  protected readonly stepDay = control<number | null>(31);
  // Tabs
  protected readonly tabsActive = signal<string | null>('invoice');
  protected readonly tabsManyActive = signal<string | null>('t1');
  // Menu
  protected readonly menuLast = signal('nenhum');
  protected readonly menuChecks = signal<readonly MenuItem[]>([
    { id: 'paid', label: 'Mostrar pagas', checked: true },
    { id: 'open', label: 'Mostrar abertas', checked: false },
    { id: 'archived', label: 'Mostrar arquivadas', checked: false },
  ]);
  // Checkbox e Switch
  protected readonly checkOn = control<boolean>(true);
  protected readonly checkOff = control<boolean>(false);
  protected readonly checkDisabled = control<boolean>(true, { disabled: true });
  protected readonly checkDisabledOff = control<boolean>(false, { disabled: true });
  protected readonly switchOn = control<boolean>(true);
  protected readonly switchOff = control<boolean>(false);
  protected readonly switchDisabled = control<boolean>(true, { disabled: true });
  protected readonly switchDisabledOff = control<boolean>(false, { disabled: true });

  // Disclosure, diálogos, avisos
  protected readonly disclosureOpen = signal(true);
  protected readonly disclosureClosed = signal(false);
  protected readonly dialogOpen = signal(false);
  protected readonly dialogRiskOpen = signal(false);
  protected readonly busy = signal(false);
  protected readonly dialogBasicOpen = signal(false);
  protected readonly dialogAlertOpen = signal(false);
  protected readonly dialogLongOpen = signal(false);
  protected readonly sheetOpen = signal(false);
  protected readonly sheetSideOpen = signal(false);
  protected readonly dialogSelect = control<string | null>('pix');
  protected readonly dialogText = control<string | null>('');

  protected readonly required = Validators.required;

  protected onMenu(id: string): void {
    this.menuLast.set(id);
  }

  protected toggleCheck(id: string): void {
    this.menuLast.set(id);
    this.menuChecks.update((items) =>
      items.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)),
    );
  }

  protected showToast(tone: 'info' | 'error'): void {
    this.toast.show(
      tone === 'info' ? 'Movimentação registrada.' : 'Não foi possível salvar. Tente de novo.',
      { tone },
    );
  }
}
