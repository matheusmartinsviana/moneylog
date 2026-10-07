import { Observable } from 'rxjs';

import type {
  DebtOverview,
  OngoingInstallmentsInput,
  OngoingPreview,
} from '~/modules/debt-overview/core/types/debt-overview';

/**
 * Porta da visão total de dívidas e da compra parcelada em andamento. Falha com `ProblemError`
 * (`ONGOING_INVALID_COUNT`, `ONGOING_FIRST_INVOICE_NOT_PAYABLE`, `ONGOING_CATEGORY_RETROACTIVE`,
 * `CARD_ARCHIVED`, `CARD_NOT_FOUND`...).
 */
export abstract class DebtOverviewGateway {
  abstract get(months: number): Observable<DebtOverview>;
  /** Não grava nada: devolve o que passa a ser devido. */
  abstract previewOngoing(
    cardId: string,
    input: OngoingInstallmentsInput,
  ): Observable<OngoingPreview>;
  /** Sem idempotência no contrato: quem chama impede o duplo envio. Devolve só o id da compra criada. */
  abstract createOngoing(cardId: string, input: OngoingInstallmentsInput): Observable<string>;
}
