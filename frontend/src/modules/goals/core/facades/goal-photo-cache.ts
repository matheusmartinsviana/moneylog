import { Injectable } from '@angular/core';
import { finalize, map, Observable, of, shareReplay } from 'rxjs';

import type { GoalPhotoVariant } from '~/modules/goals/core/types/goal';

/** Quantas imagens ficam na memória ao mesmo tempo (as que estão na tela nunca saem). */
export const GOAL_PHOTO_CACHE_LIMIT = 24;

interface Entry {
  readonly url: string;
  refs: number;
  /** A foto foi removida: o URL é revogado assim que ninguém mais o usa. */
  stale: boolean;
}

/** Chave estável de uma imagem (meta, foto e versão). */
export function photoKey(goalId: string, photoId: string, variant: GoalPhotoVariant): string {
  return `${goalId}/${photoId}/${variant}`;
}

/**
 * Cache **em memória** dos bytes das fotos como `URL.createObjectURL` (ADR-018). Nada vai para
 * `localStorage`, `IndexedDB` nem Cache Storage: a foto é dado pessoal. Limite de {@link GOAL_PHOTO_CACHE_LIMIT}
 * imagens (a mais antiga sem uso sai e tem o URL **revogado**); `clear()` revoga tudo (logout). Quem exibe
 * uma imagem a segura com `hold` e solta com `release`, então um URL em uso nunca é revogado debaixo do `<img>`.
 * Sem dependência da porta HTTP: quem carrega entrega o `loader` (assim o cache vive na raiz e a porta, na rota).
 */
@Injectable({ providedIn: 'root' })
export class GoalPhotoCache {
  /** Ordem de inserção = ordem de uso (a mais antiga primeiro). */
  private readonly entries = new Map<string, Entry>();
  private readonly inflight = new Map<string, Observable<string>>();
  private generation = 0;

  get size(): number {
    return this.entries.size;
  }

  /** URL em cache ou o carregamento (compartilhado se já em andamento). Erros não ficam guardados. */
  fetch(key: string, loader: () => Observable<Blob>): Observable<string> {
    const hit = this.entries.get(key);
    if (hit) {
      // Uso recente: vai para o fim da fila.
      this.entries.delete(key);
      this.entries.set(key, hit);
      return of(hit.url);
    }
    const running = this.inflight.get(key);
    if (running) return running;
    const generation = this.generation;
    const request = loader().pipe(
      map((blob) => {
        const url = URL.createObjectURL(blob);
        if (generation !== this.generation) {
          // O cache foi limpo (logout) durante o envio: nada fica guardado.
          URL.revokeObjectURL(url);
          return url;
        }
        this.entries.set(key, { url, refs: 0, stale: false });
        this.evict();
        return url;
      }),
      finalize(() => this.inflight.delete(key)),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.inflight.set(key, request);
    return request;
  }

  /** Marca a imagem como em uso (não é revogada enquanto houver quem a segure). */
  hold(key: string): void {
    const entry = this.entries.get(key);
    if (entry) entry.refs++;
  }

  release(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.refs = Math.max(0, entry.refs - 1);
    if (entry.refs === 0 && entry.stale) this.drop(key, entry);
    else this.evict();
  }

  /** A foto saiu da meta: esquece as duas versões (revoga já, ou quando soltarem). */
  forgetPhoto(goalId: string, photoId: string): void {
    for (const variant of ['thumb', 'display'] as const) {
      const key = photoKey(goalId, photoId, variant);
      const entry = this.entries.get(key);
      if (!entry) continue;
      if (entry.refs === 0) this.drop(key, entry);
      else entry.stale = true;
    }
  }

  /** Revoga tudo (logout). */
  clear(): void {
    this.generation++;
    for (const [key, entry] of [...this.entries]) this.drop(key, entry);
    this.inflight.clear();
  }

  private drop(key: string, entry: Entry): void {
    URL.revokeObjectURL(entry.url);
    this.entries.delete(key);
  }

  private evict(): void {
    if (this.entries.size <= GOAL_PHOTO_CACHE_LIMIT) return;
    for (const [key, entry] of this.entries) {
      if (this.entries.size <= GOAL_PHOTO_CACHE_LIMIT) return;
      if (entry.refs === 0) this.drop(key, entry);
    }
  }
}
