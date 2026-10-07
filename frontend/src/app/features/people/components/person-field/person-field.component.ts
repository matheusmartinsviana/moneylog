import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { catchError, EMPTY, Observable } from 'rxjs';

import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { SelectComponent } from '~/app/common/components/forms/select/select.component';
import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { sameName } from '~/modules/people/core/facades/person-form.facade';
import { problemOf } from '~/util/api/problem';
import type { PersonRef } from '~/util/debt';

/** Valor interno da opção "Nova pessoa…": nunca chega ao controle do formulário. */
const NEW_PERSON = '__new-person__';

/**
 * Escolher a pessoa de uma dívida e, se ela não existe, criá-la ali mesmo (S-138): "Nova pessoa…" abre
 * um nome e o botão chama `POST /v1/people` **antes** da dívida (o backend não cria pessoa implícita).
 * Presentational: quem usa passa as pessoas, o `FormControl` do id escolhido e a função `createPerson`
 * (que devolve a pessoa criada e a põe na lista). Homônimo é só aviso (a lista local já está carregada).
 * O erro de campo do formulário (`required`, `PERSON_ARCHIVED`...) é o do próprio `Select`.
 */
@Component({
  selector: 'app-person-field',
  imports: [ReactiveFormsModule, SelectComponent, TextFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './person-field.component.html',
  styleUrl: './person-field.component.css',
})
export class PersonFieldComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly t = inject(I18nService).t;

  /** O controle do id da pessoa (o do formulário que usa o campo). */
  readonly control = input.required<FormControl<string | null>>();
  readonly fieldId = input.required<string>();
  readonly label = input<string>();
  readonly people = input.required<readonly PersonRef[]>();
  /** Cria a pessoa no backend e devolve a resposta. Sem ela, a opção "Nova pessoa…" some. */
  readonly createPerson = input<((name: string) => Observable<PersonRef>) | null>(null);
  readonly created = output<PersonRef>();

  protected readonly creating = signal(false);
  protected readonly saving = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly newName = new FormControl('', { nonNullable: true });
  private readonly typed = signal('');

  protected readonly options = computed<readonly ChoiceOption[]>(() => {
    const options = this.people().map((person) => ({ value: person.id, label: person.name }));
    return this.createPerson()
      ? [...options, { value: NEW_PERSON, label: this.t().people.picker.newPerson }]
      : options;
  });
  protected readonly homonym = computed(() => {
    const name = this.typed().trim();
    return name !== '' && this.people().some((person) => sameName(person.name, name));
  });

  constructor() {
    effect((onCleanup) => {
      const control = this.control();
      const subscription = control.valueChanges.subscribe((value) => {
        if (value === NEW_PERSON) {
          control.setValue(null, { emitEvent: false });
          this.creating.set(true);
          this.failure.set(null);
        }
      });
      onCleanup(() => subscription.unsubscribe());
    });
    this.newName.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value) => this.typed.set(value));
    // O campo de nome recebe o foco quando abre.
    effect(() => {
      if (this.creating()) {
        untracked(() =>
          queueMicrotask(() =>
            this.host.nativeElement
              .querySelector<HTMLInputElement>(`input[data-cy="${this.fieldId()}-new-name"]`)
              ?.focus(),
          ),
        );
      }
    });
  }

  protected cancelNew(): void {
    this.creating.set(false);
    this.newName.reset('');
    this.failure.set(null);
  }

  protected create(): void {
    const name = this.newName.value.trim();
    const create = this.createPerson();
    if (name === '' || !create || this.saving()) {
      this.newName.markAsTouched();
      return;
    }
    this.saving.set(true);
    this.failure.set(null);
    create(name)
      .pipe(
        catchError((error: unknown) => {
          this.failure.set(problemMessage(problemOf(error), this.t().errors));
          this.saving.set(false);
          return EMPTY;
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((person) => {
        this.saving.set(false);
        this.creating.set(false);
        this.newName.reset('');
        this.control().setValue(person.id);
        this.created.emit(person);
      });
  }

  protected onEnter(event: Event): void {
    // Dentro de um formulário, o Enter do nome criaria a pessoa, não enviaria o formulário inteiro.
    event.preventDefault();
    this.create();
  }
}
