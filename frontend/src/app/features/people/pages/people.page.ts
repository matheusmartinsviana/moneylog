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
import { RouterLink, RouterOutlet } from '@angular/router';
import { catchError, exhaustMap, finalize, map, of, Subject } from 'rxjs';

import { ConfirmDialogComponent } from '~/app/common/components/confirm-dialog/confirm-dialog.component';
import {
  EmptyStateAction,
  EmptyStateComponent,
} from '~/app/common/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { SlideIndicatorDirective } from '~/app/common/motion/slide-indicator.directive';
import { EntityChanges } from '~/app/common/services/entity-changes';
import { ToastService } from '~/app/common/services/toast.service';
import { PersonRowComponent } from '~/app/features/people/components/person-row/person-row.component';
import { PeopleListFacade } from '~/modules/people/core/facades/people-list.facade';
import type { Person, PersonStatus } from '~/modules/people/core/types/person';
import { problemOf } from '~/util/api/problem';

interface RowAction {
  readonly kind: 'archive' | 'unarchive';
  readonly person: Person;
}

/**
 * Pessoas (smart, T84): lista ativas ou arquivadas (`?status=ARCHIVED` na URL) com a frase do saldo que o
 * backend calculou ("João deve R$ 150,00" / "Você deve R$ 80,00 a João"), busca pelo nome (300 ms, cancela
 * a anterior) e cards no celular / tabela no desktop. Fala só com a facade de negócio (FE 01).
 */
@Component({
  selector: 'app-people-page',
  imports: [
    SlideIndicatorDirective,
    RouterOutlet,
    RouterLink,
    ReactiveFormsModule,
    PageLayoutComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    ConfirmDialogComponent,
    TextFieldComponent,
    PersonRowComponent,
  ],
  providers: [PeopleListFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './people.page.html',
  styleUrl: './people.page.css',
})
export class PeoplePage {
  private readonly changes = inject(EntityChanges);
  private readonly toast = inject(ToastService);
  protected readonly t = inject(I18nService).t;
  protected readonly people = inject(PeopleListFacade);

  /** Filtro da URL (`?status=ARCHIVED`); qualquer outro valor mostra as ativas. */
  readonly status = input<string>();

  protected readonly filter = computed<PersonStatus>(() =>
    this.status() === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
  );
  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly pendingArchive = signal<Person | null>(null);
  protected readonly busy = signal(false);
  private readonly actions = new Subject<RowAction>();

  protected readonly emptyActions = computed<readonly EmptyStateAction[]>(() => [
    {
      id: 'add-person',
      label: this.t().emptyState.people.addPerson,
      available: true,
      primary: true,
      link: '/people/new',
    },
  ]);
  protected readonly confirmTitle = computed(() =>
    interpolate(this.t().people.archiveConfirm.title, { name: this.pendingArchive()?.name ?? '' }),
  );

  constructor() {
    // Um cadastro foi salvo no modal por cima desta página: relê do backend.
    this.changes
      .of('people')
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.people.load(this.filter(), this.search.value));
    effect(() => {
      const filter = this.filter();
      untracked(() => {
        this.search.setValue('', { emitEvent: false });
        this.people.load(filter, '');
      });
    });
    this.search.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value) => this.people.search(value));

    // exhaustMap: um toque duplo em "Arquivar" faz uma chamada só.
    this.actions
      .pipe(
        exhaustMap(({ kind, person }) => {
          this.busy.set(true);
          const call =
            kind === 'archive' ? this.people.archive(person.id) : this.people.unarchive(person.id);
          return call.pipe(
            map(() => {
              this.toast.show(
                kind === 'archive'
                  ? this.t().people.toast.archived
                  : this.t().people.toast.unarchived,
              );
            }),
            catchError((error: unknown) => {
              this.toast.show(problemMessage(problemOf(error), this.t().errors), {
                tone: 'error',
              });
              return of(null);
            }),
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

  protected askArchive(person: Person): void {
    this.pendingArchive.set(person);
  }

  protected confirmArchive(): void {
    const person = this.pendingArchive();
    if (person) this.actions.next({ kind: 'archive', person });
  }

  protected cancelArchive(): void {
    if (!this.busy()) this.pendingArchive.set(null);
  }

  protected unarchive(person: Person): void {
    this.actions.next({ kind: 'unarchive', person });
  }

  protected retry(): void {
    this.people.load(this.filter(), this.search.value);
  }
}
