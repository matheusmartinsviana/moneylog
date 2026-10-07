import { Injectable } from '@angular/core';

/** O rascunho local de uma nota: o texto digitado e a versão da nota sobre a qual ele foi escrito. */
export interface NoteDraft {
  readonly body: string;
  readonly version: number;
}

const PREFIX = 'moneylog:note-draft:';

/**
 * Rascunho local contra perda (o iOS mata a aba em segundo plano e o texto não salvo some). Fica no
 * `sessionStorage`: só desta aba, some ao fechá-la e **nunca** vai ao servidor. Qualquer falha do storage
 * (modo privado, cota, bloqueado) é ignorada: o editor funciona igual, só sem o rascunho. Um rascunho só é
 * restaurado sobre a **mesma versão** da nota (senão sobrescreveria, ao salvar, a edição de outra aba).
 */
@Injectable({ providedIn: 'root' })
export class NoteDraftStore {
  get(noteId: string): NoteDraft | null {
    try {
      const raw = window.sessionStorage.getItem(PREFIX + noteId);
      if (raw === null) return null;
      const value: unknown = JSON.parse(raw);
      if (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as NoteDraft).body === 'string' &&
        typeof (value as NoteDraft).version === 'number'
      ) {
        return { body: (value as NoteDraft).body, version: (value as NoteDraft).version };
      }
    } catch {
      // storage indisponível ou JSON inválido: sem rascunho
    }
    return null;
  }

  save(noteId: string, draft: NoteDraft): void {
    try {
      window.sessionStorage.setItem(PREFIX + noteId, JSON.stringify(draft));
    } catch {
      // cota cheia ou storage bloqueado: segue sem rascunho
    }
  }

  clear(noteId: string): void {
    try {
      window.sessionStorage.removeItem(PREFIX + noteId);
    } catch {
      // nada a fazer
    }
  }
}
