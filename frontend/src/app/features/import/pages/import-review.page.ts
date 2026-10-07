import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { ConfirmDialogComponent } from '~/app/common/components/confirm-dialog/confirm-dialog.component';
import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { SelectComponent } from '~/app/common/components/forms/select/select.component';
import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { DecisionSheetComponent } from '~/app/features/import/components/decision-sheet.component';
import { ImportLinesComponent } from '~/app/features/import/components/import-lines.component';
import { AccountsListFacade } from '~/modules/accounts/core/facades/accounts-list.facade';
import { CategoriesFacade } from '~/modules/categories/core/facades/categories.facade';
import type { Category } from '~/modules/categories/core/types/category';
import { ImportReviewFacade } from '~/modules/imports/core/facades/import-review.facade';
import type {
  ImportLine,
  ImportLineFlag,
  ImportLinePatch,
  ImportLineStatus,
} from '~/modules/imports/core/types/import';
import type { Problem } from '~/util/api/problem';

const STATUSES: readonly ImportLineStatus[] = [
  'PENDING',
  'ACCEPTED',
  'DUPLICATE',
  'POSSIBLE_DUPLICATE',
  'REJECTED',
];
const FLAGS: readonly ImportLineFlag[] = [
  'LOOKS_LIKE_INVOICE_PAYMENT',
  'CARD_CREDIT_NOT_IMPORTED',
  'LOOKS_LIKE_INSTALLMENT',
  'POSSIBLE_TRANSFER',
];

/**
 * Revisão de um lote (smart): linhas com data, descrição, valor, categoria sugerida (com confiança em texto),
 * método, situação e marcas; aceitar, rejeitar, forçar, decidir transferência/parcela; "aceitar todas as sem
 * decisão" (em lote); aplicar (com resumo e confirmação) e desfazer (com motivo). Os contadores, o resumo e o
 * que falta decidir vêm do backend; depois de cada ação a tela usa a resposta ou relê o lote. "Aplicar" fica
 * bloqueado, com a explicação, enquanto houver linha pedindo decisão.
 */
@Component({
  selector: 'app-import-review-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    PageLayoutComponent,
    ErrorStateComponent,
    ConfirmDialogComponent,
    SelectComponent,
    ImportLinesComponent,
    DecisionSheetComponent,
  ],
  providers: [ImportReviewFacade, AccountsListFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './import-review.page.html',
  styleUrl: './import-review.page.css',
})
export class ImportReviewPage {
  private readonly router = inject(Router);
  private readonly categories = inject(CategoriesFacade);
  private readonly accounts = inject(AccountsListFacade);
  protected readonly t = inject(I18nService).t;
  protected readonly review = inject(ImportReviewFacade);

  /** `:id` da rota. */
  readonly id = input.required<string>();

  protected readonly statusControl = new FormControl<string | null>(null);
  protected readonly flagControl = new FormControl<string | null>(null);
  protected readonly decisionLine = signal<ImportLine | null>(null);
  protected readonly confirmApply = signal(false);
  protected readonly confirmUndo = signal(false);
  protected readonly confirmDiscard = signal(false);

  private readonly expense = signal<readonly Category[]>([]);
  private readonly income = signal<readonly Category[]>([]);

  protected readonly categoryNames = computed<Record<string, string>>(() => {
    const names: Record<string, string> = {};
    for (const c of [...this.expense(), ...this.income()]) names[c.id] = c.name;
    return names;
  });
  protected readonly categoryOptions = computed<readonly ChoiceOption[]>(() => {
    const line = this.decisionLine();
    const list = line?.direction === 'IN' ? this.income() : this.expense();
    return list.map((c) => ({ value: c.id, label: c.name }));
  });
  protected readonly accountOptions = computed<readonly ChoiceOption[]>(() =>
    (this.accounts.data() ?? [])
      .filter((a) => a.liquidity === 'CASH' && a.id !== this.review.batch()?.accountId)
      .map((a) => ({ value: a.id, label: a.name })),
  );
  protected readonly statusOptions = computed<readonly ChoiceOption[]>(() =>
    STATUSES.map((s) => ({ value: s, label: this.t().imports.lineStatus[s] })),
  );
  protected readonly flagOptions = computed<readonly ChoiceOption[]>(() =>
    FLAGS.map((f) => ({ value: f, label: this.t().imports.flags[f] })),
  );

  protected readonly loadProblem = computed(() => {
    const state = this.review.loadStatus();
    return state.status === 'error' ? state.problem : null;
  });
  protected readonly notFound = computed(() => this.loadProblem()?.status === 404);
  /** Mensagem genérica; as falhas com ações próprias (perna da transferência, aplicar) têm banner à parte. */
  protected readonly actionError = computed(() => {
    const problem = this.review.problem();
    if (!problem || this.legConflictLine() || this.review.applyFailure()) return null;
    return problemMessage(problem, this.t().errors);
  });
  protected readonly legConflictLine = computed(() => {
    const id = this.review.legConflictLineId();
    return id ? (this.review.lines().find((l) => l.id === id) ?? null) : null;
  });
  protected readonly applyFailureText = computed(() => {
    const failure = this.review.applyFailure();
    if (!failure) return null;
    const copy = this.t().imports.review.applyFailed;
    const position = failure.position === null ? null : String(failure.position);
    const head = position === null ? copy.withoutLine : interpolate(copy.withLine, { position });
    const cause =
      failure.cause === 'IMPORT_LINE_ALREADY_RECORDED'
        ? copy.alreadyRecorded
        : failure.cause === 'IMPORT_TRANSFER_LEG_ALREADY_RECORDED'
          ? copy.legAlreadyRecorded
          : copy.other;
    return {
      text: `${head} ${cause}`,
      position: failure.position,
      rejectLabel: interpolate(copy.rejectLine, { position: position ?? '' }),
    };
  });
  protected readonly summary = computed(() => {
    const counts = this.review.batch()?.counts;
    if (!counts) return '';
    return interpolate(this.t().imports.review.summary, {
      accepted: String(counts.accepted),
      rejected: String(counts.rejected),
      decide: String(counts.requireDecision),
    });
  });
  protected readonly needsDecisionText = computed(() =>
    interpolate(this.t().imports.review.needsDecision, {
      count: String(this.review.requireDecision()),
    }),
  );
  protected readonly applyDescription = computed(() =>
    interpolate(this.t().imports.review.applyConfirm.description, {
      accepted: String(this.review.batch()?.counts.accepted ?? 0),
    }),
  );
  protected readonly appliedText = computed(() =>
    interpolate(this.t().imports.review.applied, {
      created: String(this.review.created()?.length ?? 0),
    }),
  );
  protected readonly bulkText = computed(() => {
    const result = this.review.bulkResult();
    if (!result) return null;
    const copy = this.t().imports.review;
    const done = interpolate(copy.bulkDone, { updated: String(result.updated) });
    return result.skipped.length > 0
      ? `${done} ${interpolate(copy.bulkSkipped, { count: String(result.skipped.length) })}`
      : done;
  });
  protected readonly bulkReasons = computed(() => {
    const result = this.review.bulkResult();
    if (!result) return [];
    const labels = this.t().imports.review.skipReasons;
    const counts = new Map<string, number>();
    for (const s of result.skipped) counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);
    return [...counts.entries()].map(([reason, count]) => ({
      reason,
      count,
      label: Object.hasOwn(labels, reason) ? labels[reason as keyof typeof labels] : reason,
    }));
  });
  protected readonly blockedItems = computed(() =>
    this.review.blocked().map((b) => ({
      id: b.transactionId,
      text: problemMessage(blockedProblem(b.code), this.t().errors),
    })),
  );
  protected readonly canApply = computed(
    () =>
      this.review.editable() && this.review.requireDecision() === 0 && this.review.busy() === null,
  );
  protected readonly canUndo = computed(() => {
    const status = this.review.batch()?.status;
    return status === 'APPLIED' || status === 'PARTIALLY_UNDONE';
  });
  protected readonly warningTexts = computed(() => {
    const copy = this.t().imports.warnings;
    return (this.review.batch()?.warnings ?? []).map((code) =>
      code === 'SAME_FILE_ALREADY_IMPORTED'
        ? { code, text: copy.SAME_FILE_ALREADY_IMPORTED }
        : code === 'STATEMENT_KIND_MISMATCH'
          ? { code, text: copy.STATEMENT_KIND_MISMATCH }
          : { code, text: copy.other },
    );
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => {
        this.review.load(id);
        this.accounts.load('ACTIVE');
      });
    });
    effect(() => {
      if (this.review.discarded()) void this.router.navigateByUrl('/import');
    });
    forkJoin([this.categories.list('EXPENSE'), this.categories.list('INCOME')])
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: ([expense, income]) => {
          this.expense.set(expense);
          this.income.set(income);
        },
        // Sem categorias o nome some, mas a revisão segue (a falha aparece ao decidir).
        error: () => undefined,
      });
    this.statusControl.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.applyFilter());
    this.flagControl.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.applyFilter());
  }

  protected applyFilter(): void {
    this.review.setFilter({
      status: STATUSES.find((s) => s === this.statusControl.value) ?? null,
      flag: FLAGS.find((f) => f === this.flagControl.value) ?? null,
    });
  }

  /** Aceita com a categoria já definida ou sugerida; sem categoria, abre a folha. */
  protected accept(line: ImportLine): void {
    const categoryId = line.categoryId ?? line.suggestion?.categoryId ?? null;
    if (categoryId === null) {
      this.decisionLine.set(line);
      return;
    }
    this.review.review(line.id, {
      action: 'ACCEPT',
      categoryId,
      method: line.method ?? line.suggestion?.method ?? null,
    });
  }

  protected reject(line: ImportLine): void {
    this.review.review(line.id, { action: 'REJECT' });
  }

  protected reopen(line: ImportLine): void {
    this.review.review(line.id, { action: 'REOPEN' });
  }

  protected doDiscard(): void {
    this.confirmDiscard.set(false);
    this.review.discardBatch();
  }

  protected openDecision(line: ImportLine): void {
    this.decisionLine.set(line);
  }

  protected decided(patch: ImportLinePatch): void {
    const line = this.decisionLine();
    if (!line) return;
    this.review.review(line.id, patch);
    this.decisionLine.set(null);
  }

  protected doApply(): void {
    this.confirmApply.set(false);
    this.review.applyBatch();
  }

  protected doUndo(reason: string): void {
    this.confirmUndo.set(false);
    this.review.undoBatch(reason === '' ? null : reason);
  }
}

function blockedProblem(code: string): Problem {
  return { status: 422, code, fieldErrors: [], traceId: null, retryAfterSeconds: null };
}
