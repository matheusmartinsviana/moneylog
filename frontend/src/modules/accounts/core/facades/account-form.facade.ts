import { inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  catchError,
  exhaustMap,
  Observable,
  of,
  startWith,
  Subject,
  switchMap,
  tap,
  map,
} from 'rxjs';

import { AccountsGateway } from '~/modules/accounts/core/interfaces/accounts.gateway';
import type { Account } from '~/modules/accounts/core/types/account';
import type { AccountInput, AccountUpdate } from '~/modules/accounts/core/types/account-input';
import { Problem, problemOf } from '~/util/api/problem';

export type SaveAccount =
  | { readonly kind: 'create'; readonly input: AccountInput }
  | { readonly kind: 'update'; readonly id: string; readonly input: AccountUpdate };

export type AccountLoadState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly account: Account };

/**
 * Facade do formulário de conta (criar e editar). O salvar usa `exhaustMap` (clique duplo = uma
 * requisição) e devolve **o recurso da resposta**: nada de chutar o estado (FE 05). Falhas chegam
 * tipadas (`code` + `fieldErrors`) em `problem`, para a tela traduzir e marcar os campos.
 *
 * Escopo de componente (`providers: [AccountFormFacade]`).
 */
@Injectable()
export class AccountFormFacade {
  private readonly gateway = inject(AccountsGateway);
  private readonly saves = new Subject<SaveAccount>();
  private readonly loads = new Subject<string>();
  private readonly savedEvents = new Subject<Account>();
  private readonly savingState = signal(false);
  private readonly problemState = signal<Problem | null>(null);
  private readonly loadState = signal<AccountLoadState>({ status: 'idle' });
  private readonly loaded = signal<Account | null>(null);

  readonly saving = this.savingState.asReadonly();
  /** Última falha do salvar (limpa quando um novo envio começa). */
  readonly problem = this.problemState.asReadonly();
  readonly loadStatus = this.loadState.asReadonly();
  /** A conta carregada; durante uma recarga (ex.: depois de um 409) continua a anterior. */
  readonly account = this.loaded.asReadonly();
  /** Emite a conta devolvida pela API quando o salvar dá certo. */
  readonly saved$ = this.savedEvents.asObservable();

  constructor() {
    this.saves
      .pipe(
        exhaustMap((command) => {
          this.savingState.set(true);
          this.problemState.set(null);
          return this.send(command).pipe(
            tap((account) => this.savedEvents.next(account)),
            map(() => null),
            catchError((error: unknown) => of(problemOf(error))),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((problem) => {
        this.savingState.set(false);
        this.problemState.set(problem);
      });

    this.loads
      .pipe(
        switchMap((id) =>
          this.gateway.get(id).pipe(
            map((account): AccountLoadState => ({ status: 'ready', account })),
            startWith<AccountLoadState>({ status: 'loading' }),
            catchError((error: unknown) =>
              of<AccountLoadState>({ status: 'error', problem: problemOf(error) }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => {
        this.loadState.set(state);
        if (state.status === 'ready') this.loaded.set(state.account);
        else if (state.status === 'error') this.loaded.set(null);
      });
  }

  /** Carrega a conta para edição (também recarrega depois de um `409 VERSION_CONFLICT`). */
  load(id: string): void {
    this.loads.next(id);
  }

  save(command: SaveAccount): void {
    this.saves.next(command);
  }

  private send(command: SaveAccount): Observable<Account> {
    return command.kind === 'create'
      ? this.gateway.create(command.input)
      : this.gateway.update(command.id, command.input);
  }
}
