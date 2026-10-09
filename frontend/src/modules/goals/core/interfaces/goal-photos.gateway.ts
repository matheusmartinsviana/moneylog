import { Observable } from 'rxjs';

import type { Goal, GoalPhoto, GoalPhotoVariant } from '~/modules/goals/core/types/goal';

/** Progresso do envio (0 a 100) e, no fim, a foto criada pelo servidor. */
export type PhotoUploadEvent =
  | { readonly kind: 'progress'; readonly percent: number }
  | { readonly kind: 'done'; readonly photo: GoalPhoto };

/**
 * Porta das fotos das metas de sonho (ADR-018). As implementações falham com `ProblemError`
 * (`GOAL_PHOTO_*`, `GOAL_ARCHIVED`, `IDEMPOTENCY_KEY_REUSED`, 429...). Escrever devolve a meta atualizada.
 */
export abstract class GoalPhotosGateway {
  /** Uma foto por vez. `idempotencyKey`: o reenvio do mesmo arquivo reusa a chave (o servidor não duplica). */
  abstract upload(
    goalId: string,
    file: Blob,
    fileName: string,
    idempotencyKey: string,
  ): Observable<PhotoUploadEvent>;
  /** Bytes da foto como `Blob` (rota autenticada: o `<img>` não envia o token). */
  abstract content(goalId: string, photoId: string, variant: GoalPhotoVariant): Observable<Blob>;
  /** Conjunto exato dos ids, na nova ordem (a primeira é a capa). */
  abstract reorder(goalId: string, photoIds: readonly string[]): Observable<Goal>;
  abstract setCover(goalId: string, photoId: string): Observable<Goal>;
  abstract remove(goalId: string, photoId: string): Observable<Goal>;
}
