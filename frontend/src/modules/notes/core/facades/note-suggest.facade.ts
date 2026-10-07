import { inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, map, of, Subject, switchMap } from 'rxjs';

import { NotesGateway } from '~/modules/notes/core/interfaces/notes.gateway';
import type { NoteSummary } from '~/modules/notes/core/types/note';

const SUGGEST_DEBOUNCE_MS = 150;
const SUGGEST_LIMIT = 8;

/**
 * Sugestões do autocomplete de `[[`: notas ativas que casam com o que foi digitado (busca do backend, sem
 * acento nem caixa). Cada digitação cancela a anterior (`switchMap`); falha vira lista vazia (o autocomplete
 * nunca bloqueia a escrita). Escopo de componente.
 */
@Injectable()
export class NoteSuggestFacade {
  private readonly gateway = inject(NotesGateway);
  private readonly terms = new Subject<string>();
  private readonly results = signal<readonly NoteSummary[]>([]);
  private readonly loadingState = signal(false);

  readonly suggestions = this.results.asReadonly();
  readonly loading = this.loadingState.asReadonly();

  constructor() {
    this.terms
      .pipe(
        debounceTime(SUGGEST_DEBOUNCE_MS),
        switchMap((term) => {
          this.loadingState.set(true);
          return this.gateway
            .list({
              status: 'ACTIVE',
              ...(term !== '' ? { q: term } : {}),
              page: 1,
              pageSize: SUGGEST_LIMIT,
            })
            .pipe(
              map((slice) => slice.items),
              catchError(() => of<readonly NoteSummary[]>([])),
            );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((items) => {
        this.results.set(items);
        this.loadingState.set(false);
      });
  }

  search(term: string): void {
    this.terms.next(term.trim().slice(0, 200));
  }

  clear(): void {
    this.results.set([]);
  }
}
