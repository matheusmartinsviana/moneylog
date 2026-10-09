import {
  afterNextRender,
  computed,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormGroup } from '@angular/forms';

import { applyProblemToForm } from '~/app/common/forms/problem-form';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { problemMessage } from '~/app/common/i18n/problem-message';
import type { TransactionInput } from '~/modules/transactions/core/types/transaction-input';
import type { Problem } from '~/util/api/problem';

/**
 * Códigos de regra do backend → campo do formulário (os controles têm o nome do campo da entrada).
 * Um `code` sem controle correspondente (ex.: `ACCOUNT_ARCHIVED`) vira o aviso geral do formulário.
 */
export const TRANSACTION_CODE_TO_FIELD: Readonly<Record<string, string>> = {
  REFUND_EXCEEDS_ORIGINAL: 'amount',
  TRANSACTION_AMOUNT_NOT_POSITIVE: 'amount',
  REFUND_CATEGORY_LOCKED: 'categoryId',
  INCOME_COMPETENCE_INVALID: 'incomeCompetence',
  CATEGORY_KIND_MISMATCH: 'categoryId',
  CATEGORY_ARCHIVED: 'categoryId',
  CATEGORY_NOT_FOUND: 'categoryId',
  TRANSACTION_ACCOUNT_NOT_CASH: 'accountId',
  TRANSACTION_PAYMENT_METHOD_REQUIRED: 'method',
  TRANSFER_SAME_ACCOUNT: 'toAccountId',
  TRANSFER_ACROSS_LIQUIDITY: 'toAccountId',
  INVESTMENT_ACCOUNTS_MISMATCH: 'investmentAccountId',
  ADJUSTMENT_REASON_REQUIRED: 'reason',
  ADJUSTMENT_YIELD_REQUIRES_INVESTMENT_ACCOUNT: 'kind',
  // Compra no cartão (T67): o cartão, o valor e as parcelas têm campo próprio.
  CARD_NOT_FOUND: 'cardId',
  CARD_ARCHIVED: 'cardId',
  CARD_INVALID_INSTALLMENT_COUNT: 'installments',
  CARD_INVALID_INSTALLMENT: 'installments',
  MONEY_INVALID_ALLOCATION: 'installments',
  AMOUNT_ABOVE_LIMIT: 'amount',
  // Pessoas e dívidas (T85, T86): a pessoa, a dívida e as partes têm campo próprio.
  PERSON_ARCHIVED: 'personId',
  PERSON_NOT_FOUND: 'personId',
  DEBT_SETTLEMENT_EXCEEDS_OUTSTANDING: 'amount',
  DEBT_NOT_FOUND: 'debtId',
  DEBT_CLOSED: 'debtId',
  DEBT_ALREADY_SETTLED: 'debtId',
  DEBT_DIRECTION_MISMATCH: 'debtId',
  SHARES_EXCEED_AMOUNT: 'shares',
  SHARE_PERSON_ARCHIVED: 'shares',
};

/**
 * Base dos formulários de movimentação (apresentacionais, T38/T41 e reaproveitados na edição, T40).
 * Cada formulário recebe o estado do salvar de quem o usa (`saving`, `problem`, `canRetry`) e emite a
 * entrada pronta (`submitted`); nenhum fala com a API. Aqui ficam o que todos repetem:
 * - a falha do backend vai para o campo certo, sem perder o digitado (`applyProblemToForm`);
 * - `resetToken` muda depois de um salvar bem-sucedido: limpa valor e descrição e mantém o resto;
 * - `focusToken` muda quando alguém pede "novo registro": foco no valor.
 */
@Directive()
export abstract class TransactionFormBase {
  protected readonly t = inject(I18nService).t;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly saving = input(false);
  readonly problem = input<Problem | null>(null);
  /** O último envio falhou de um jeito que "tentar de novo" (mesma chave) resolve. */
  readonly canRetry = input(false);
  readonly submitLabel = input<string>();
  /** Rota do "cancelar" (edição); `null` esconde o botão. */
  readonly cancelLink = input<string | null>(null);
  readonly resetToken = input(0);
  readonly focusToken = input(0);
  /** Foco no valor ao abrir o formulário. */
  readonly autofocus = input(true);

  readonly submitted = output<TransactionInput>();
  readonly retry = output<void>();

  protected abstract readonly form: FormGroup;
  /** Monta a entrada a partir do formulário (já validado). */
  protected abstract build(): TransactionInput;
  /** Limpa valor e descrição depois de salvar (mantém conta, data e modo). */
  protected abstract clearAfterSave(): void;

  private readonly fieldHandled = signal(false);
  protected readonly banner = computed(() => {
    const problem = this.problem();
    if (!problem || this.fieldHandled()) return null;
    return problemMessage(problem, this.t().errors);
  });

  constructor() {
    effect(() => {
      const problem = this.problem();
      untracked(() =>
        this.fieldHandled.set(
          problem ? applyProblemToForm(this.form, problem, TRANSACTION_CODE_TO_FIELD) : false,
        ),
      );
    });
    effect(() => {
      if (this.resetToken() > 0) {
        untracked(() => {
          this.clearAfterSave();
          this.focusAmount();
        });
      }
    });
    effect(() => {
      if (this.focusToken() > 0) untracked(() => this.focusAmount());
    });
    afterNextRender(() => {
      // Depois do painel do modal, que também move o foco ao abrir: o valor é quem fica com ele.
      if (this.autofocus()) void Promise.resolve().then(() => this.focusAmount());
    });
  }

  protected onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.submitted.emit(this.build());
  }

  protected focusAmount(): void {
    this.host.nativeElement.querySelector<HTMLInputElement>('input[data-cy$="amount"]')?.focus();
  }
}
