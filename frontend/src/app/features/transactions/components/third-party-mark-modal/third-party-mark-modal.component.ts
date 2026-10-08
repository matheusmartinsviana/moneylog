import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  OnInit,
  output,
  signal,
  untracked,
  effect,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, tap } from 'rxjs';

import { FormModalComponent } from '~/app/common/components/form-modal/form-modal.component';
import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { dirtySignal } from '~/app/common/forms/dirty-signal';
import { applyProblemToForm } from '~/app/common/forms/problem-form';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { PersonFieldComponent } from '~/app/features/people/components/person-field/person-field.component';
import { PeopleListFacade } from '~/modules/people/core/facades/people-list.facade';
import { ThirdPartyExpenseFacade } from '~/modules/third-parties/core/facades/third-party-expense.facade';
import type { PersonRef } from '~/util/debt';

const CODE_TO_FIELD: Readonly<Record<string, string>> = {
  PERSON_ARCHIVED: 'personId',
  PERSON_NOT_FOUND: 'personId',
};

/**
 * "Marcar como despesa de terceiro" (modal): escolhe a pessoa responsável (ou cria uma ali mesmo) e uma
 * observação opcional. A marca não muda o lançamento: o gasto segue no seu bruto até o reembolso. Usa o
 * `ThirdPartyExpenseFacade` da página (`exhaustMap` + `Idempotency-Key`); erros 422 vão para o campo ou
 * para o aviso do formulário.
 */
@Component({
  selector: 'app-third-party-mark-modal',
  imports: [ReactiveFormsModule, FormModalComponent, PersonFieldComponent, TextFieldComponent],
  providers: [PeopleListFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-form-modal
      #modal
      [heading]="t().transactions.thirdParty.modal.title"
      [dirty]="dirty()"
      [busy]="facade.saving()"
      (closed)="closed.emit()"
    >
      <form class="form" [formGroup]="form" (ngSubmit)="onSubmit()" novalidate data-cy="tp-form">
        <p class="hint" data-cy="tp-description">
          {{ t().transactions.thirdParty.modal.description }}
        </p>
        @if (banner(); as message) {
          <p class="banner" role="alert" data-cy="tp-error">{{ message }}</p>
        }
        <app-person-field
          fieldId="tp-person"
          [control]="form.controls.personId"
          [label]="t().transactions.thirdParty.modal.person"
          [people]="people()"
          [createPerson]="createPerson"
        />
        <app-text-field
          formControlName="note"
          fieldId="tp-note"
          autocomplete="off"
          [maxlength]="200"
          [mandatory]="false"
          [label]="t().transactions.thirdParty.modal.note"
        />
        <div class="actions">
          <button type="button" class="button" data-cy="tp-cancel" (click)="modal.requestClose()">
            {{ t().transactions.thirdParty.modal.cancel }}
          </button>
          <button
            type="submit"
            class="button button--primary"
            data-cy="tp-save"
            [disabled]="facade.saving()"
            [attr.aria-busy]="facade.saving()"
          >
            {{
              facade.saving()
                ? t().transactions.thirdParty.modal.saving
                : t().transactions.thirdParty.modal.save
            }}
          </button>
        </div>
      </form>
    </app-form-modal>
  `,
  styles: `
    :host {
      display: contents;
    }

    .form {
      display: grid;
      gap: var(--space-4);
    }

    .hint {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--space-2);
    }
  `,
})
export class ThirdPartyMarkModalComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly peopleFacade = inject(PeopleListFacade);
  protected readonly t = inject(I18nService).t;
  protected readonly facade = inject(ThirdPartyExpenseFacade);

  /** A compra ou despesa a marcar. */
  readonly transactionId = input.required<string>();

  readonly closed = output<void>();
  /** Marcada (resposta do backend): quem usa relê a marca e avisa. */
  readonly marked = output<void>();

  protected readonly form = new FormGroup({
    personId: new FormControl<string | null>(null, [Validators.required]),
    note: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(200)] }),
  });
  protected readonly dirty = dirtySignal(this.form);
  protected readonly people = signal<readonly PersonRef[]>([]);

  private readonly fieldHandled = signal(false);
  protected readonly banner = computed(() => {
    const problem = this.facade.problem();
    if (!problem || this.fieldHandled()) return null;
    return problemMessage(problem, this.t().errors);
  });

  /** Cria a pessoa antes da marca e a põe na lista: a resposta do backend é a escolhida. */
  protected readonly createPerson = (name: string): Observable<PersonRef> =>
    this.peopleFacade
      .create({ name, notes: null })
      .pipe(
        tap((person) =>
          this.people.update((list) => [...list, { id: person.id, name: person.name }]),
        ),
      );

  constructor() {
    effect(() => {
      const problem = this.facade.problem();
      untracked(() =>
        this.fieldHandled.set(
          problem ? applyProblemToForm(this.form, problem, CODE_TO_FIELD) : false,
        ),
      );
    });
    this.facade.marked$.pipe(takeUntilDestroyed()).subscribe(() => this.marked.emit());
  }

  ngOnInit(): void {
    this.facade.clearProblem();
    this.peopleFacade
      .loadAll('ACTIVE')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => this.people.set(list.map(({ id, name }) => ({ id, name }))),
      });
  }

  protected onSubmit(): void {
    this.form.markAllAsTouched();
    const personId = this.form.controls.personId.value;
    if (this.form.invalid || personId === null) return;
    this.facade.mark({
      transactionId: this.transactionId(),
      personId,
      note: this.form.controls.note.value,
    });
  }
}
