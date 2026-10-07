import { inject, Injectable } from '@angular/core';
import { Observable, shareReplay, tap } from 'rxjs';

import { CategoriesGateway } from '~/modules/categories/core/interfaces/categories.gateway';
import type {
  Category,
  CategoryInput,
  CategoryKind,
  CategoryRename,
} from '~/modules/categories/core/types/category';

/**
 * Facade de negócio das categorias (FE 01): lista por `kind`, **cacheia por sessão** (a lista é curta
 * e muda pouco; os seletores do `/quick-add` a reaproveitam) e **invalida** o cache depois de criar,
 * renomear, arquivar ou desarquivar. As mutações devolvem o recurso da resposta.
 *
 * Singleton: o cache vale enquanto o app estiver aberto. Uma falha não fica em cache.
 */
@Injectable({ providedIn: 'root' })
export class CategoriesFacade {
  private readonly gateway = inject(CategoriesGateway);
  private cache = new Map<string, Observable<readonly Category[]>>();

  /** Categorias do `kind` (só as ativas por padrão; `includeArchived` traz também as arquivadas). */
  list(kind: CategoryKind, includeArchived = false): Observable<readonly Category[]> {
    const key = `${kind}:${includeArchived}`;
    let cached = this.cache.get(key);
    if (!cached) {
      cached = this.gateway.list({ kind, includeArchived }).pipe(
        // Falha não fica em cache: o "tentar de novo" pede de novo.
        tap({ error: () => this.cache.delete(key) }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
      this.cache.set(key, cached);
    }
    return cached;
  }

  create(input: CategoryInput): Observable<Category> {
    return this.gateway.create(input).pipe(tap(() => this.invalidate()));
  }

  rename(id: string, input: CategoryRename): Observable<Category> {
    return this.gateway.rename(id, input).pipe(tap(() => this.invalidate()));
  }

  archive(id: string): Observable<Category> {
    return this.gateway.archive(id).pipe(tap(() => this.invalidate()));
  }

  unarchive(id: string): Observable<Category> {
    return this.gateway.unarchive(id).pipe(tap(() => this.invalidate()));
  }

  /** Descarta as listas em cache (a próxima leitura vai ao backend). */
  invalidate(): void {
    this.cache = new Map();
  }
}
