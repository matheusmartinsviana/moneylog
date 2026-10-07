import { Injectable } from '@angular/core';
import { filter, Observable, Subject } from 'rxjs';

export type EntityScope = 'accounts' | 'cards' | 'goals' | 'people' | 'recurrences';

/**
 * Aviso de "salvei um cadastro" entre o formulário em modal (rota-filha) e a página que está atrás
 * dele (lista ou detalhe), que continua montada e precisa reler do backend. Não carrega dados: quem
 * ouve recarrega pela própria facade.
 */
@Injectable({ providedIn: 'root' })
export class EntityChanges {
  private readonly subject = new Subject<EntityScope>();

  notify(scope: EntityScope): void {
    this.subject.next(scope);
  }

  /** Emite quando algo do escopo foi salvo. */
  of(scope: EntityScope): Observable<EntityScope> {
    return this.subject.pipe(filter((s) => s === scope));
  }
}
