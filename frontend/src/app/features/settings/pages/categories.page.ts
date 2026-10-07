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
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, exhaustMap, finalize, map, Observable, of, Subject } from 'rxjs';

import { ConfirmDialogComponent } from '~/app/common/components/confirm-dialog/confirm-dialog.component';
import { DisclosureComponent } from '~/app/common/components/disclosure/disclosure.component';
import { EmptyStateComponent } from '~/app/common/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { ToastService } from '~/app/common/services/toast.service';
import {
  CATEGORY_NAME_MAX,
  CategoryRowComponent,
} from '~/app/features/settings/components/category-row/category-row.component';
import { CategoriesManageFacade } from '~/modules/categories/core/facades/categories-manage.facade';
import type { Category, CategoryKind } from '~/modules/categories/core/types/category';
import { Problem, problemOf } from '~/util/api/problem';

type Action =
  | { readonly kind: 'create'; readonly name: string }
  | { readonly kind: 'rename'; readonly category: Category; readonly name: string }
  | { readonly kind: 'archive'; readonly category: Category }
  | { readonly kind: 'unarchive'; readonly category: Category };

/**
 * Configurações → Categorias (smart): abas Despesa/Receita (`?kind=INCOME` na URL), criar, renomear
 * inline, arquivar (com confirmação) e desarquivar. Não existe excluir (S-70). A lista é atualizada
 * a partir do recurso devolvido pela API; `409 CATEGORY_NAME_TAKEN` vai para o campo do nome.
 */
@Component({
  selector: 'app-categories-page',
  imports: [
    DisclosureComponent,
    ReactiveFormsModule,
    RouterLink,
    PageLayoutComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    ConfirmDialogComponent,
    TextFieldComponent,
    CategoryRowComponent,
  ],
  providers: [CategoriesManageFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './categories.page.html',
  styleUrl: './categories.page.css',
})
export class CategoriesPage {
  private readonly toast = inject(ToastService);
  protected readonly t = inject(I18nService).t;
  protected readonly categories = inject(CategoriesManageFacade);

  /** Aba da URL (`?kind=INCOME`); qualquer outro valor mostra as despesas. */
  readonly kind = input<string>();

  protected readonly activeKind = computed<CategoryKind>(() =>
    this.kind() === 'INCOME' ? 'INCOME' : 'EXPENSE',
  );
  protected readonly creating = signal(false);
  protected readonly renamingId = signal<string | null>(null);
  protected readonly renameCode = signal<string | null>(null);
  protected readonly pendingArchive = signal<Category | null>(null);
  protected readonly busy = signal(false);
  protected readonly maxLength = CATEGORY_NAME_MAX;

  protected readonly newName = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(CATEGORY_NAME_MAX)],
  });

  protected readonly archivedOpen = signal(false);
  protected readonly archivedLabel = computed(() =>
    interpolate(this.t().categories.archivedGroup, {
      count: String(this.categories.archived().length),
    }),
  );
  protected readonly confirmTitle = computed(() =>
    interpolate(this.t().categories.archiveConfirm.title, {
      name: this.pendingArchive()?.name ?? '',
    }),
  );

  private readonly actions = new Subject<Action>();

  constructor() {
    effect(() => {
      const kind = this.activeKind();
      untracked(() => {
        this.creating.set(false);
        this.renamingId.set(null);
        this.categories.load(kind);
      });
    });

    // exhaustMap: um toque duplo faz uma chamada só (FE 02).
    this.actions
      .pipe(
        exhaustMap((action) => {
          this.busy.set(true);
          return this.run(action).pipe(
            finalize(() => {
              this.busy.set(false);
              this.pendingArchive.set(null);
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  protected startCreate(): void {
    this.newName.reset('');
    this.creating.set(true);
  }

  protected cancelCreate(): void {
    this.creating.set(false);
  }

  protected submitCreate(): void {
    this.newName.markAsTouched();
    if (this.newName.invalid) return;
    this.actions.next({ kind: 'create', name: this.newName.value.trim() });
  }

  protected startRename(category: Category): void {
    this.renameCode.set(null);
    this.renamingId.set(category.id);
  }

  protected cancelRename(): void {
    this.renamingId.set(null);
    this.renameCode.set(null);
  }

  protected rename(event: { category: Category; name: string }): void {
    this.renameCode.set(null);
    this.actions.next({ kind: 'rename', category: event.category, name: event.name });
  }

  protected askArchive(category: Category): void {
    this.pendingArchive.set(category);
  }

  protected confirmArchive(): void {
    const category = this.pendingArchive();
    if (category) this.actions.next({ kind: 'archive', category });
  }

  protected cancelArchive(): void {
    if (!this.busy()) this.pendingArchive.set(null);
  }

  protected unarchive(category: Category): void {
    this.actions.next({ kind: 'unarchive', category });
  }

  protected retry(): void {
    this.categories.load(this.activeKind());
  }

  private run(action: Action): Observable<unknown> {
    switch (action.kind) {
      case 'create':
        return this.categories.create(action.name).pipe(
          map((category) => {
            this.creating.set(false);
            this.toast.show(
              interpolate(this.t().categories.toast.created, { name: category.name }),
            );
          }),
          catchError((error: unknown) => this.fail(error, 'create')),
        );
      case 'rename':
        return this.categories.rename(action.category, action.name).pipe(
          map(() => {
            this.renamingId.set(null);
            this.toast.show(this.t().categories.toast.renamed);
          }),
          catchError((error: unknown) => this.fail(error, 'rename')),
        );
      case 'archive':
        return this.categories.archive(action.category.id).pipe(
          map(() => this.toast.show(this.t().categories.toast.archived)),
          catchError((error: unknown) => this.fail(error, 'toast')),
        );
      case 'unarchive':
        return this.categories.unarchive(action.category.id).pipe(
          map(() => this.toast.show(this.t().categories.toast.unarchived)),
          catchError((error: unknown) => this.fail(error, 'toast')),
        );
    }
  }

  /** Nome repetido vai para o campo; o resto vira aviso com a mensagem do `code`. */
  private fail(error: unknown, target: 'create' | 'rename' | 'toast'): Observable<null> {
    const problem: Problem = problemOf(error);
    if (target === 'create' && problem.code === 'CATEGORY_NAME_TAKEN') {
      this.newName.setErrors({ server: problem.code });
      this.newName.markAsTouched();
    } else if (target === 'rename' && problem.code === 'CATEGORY_NAME_TAKEN') {
      this.renameCode.set(problem.code);
    } else {
      this.toast.show(problemMessage(problem, this.t().errors), { tone: 'error' });
    }
    return of(null);
  }
}
