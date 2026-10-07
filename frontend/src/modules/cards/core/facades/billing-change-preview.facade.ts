import { inject, Injectable } from '@angular/core';

import { DebouncedPreview } from '~/modules/cards/core/facades/debounced-preview';
import { CardsGateway } from '~/modules/cards/core/interfaces/cards.gateway';
import type {
  BillingChangePreview,
  BillingDays,
} from '~/modules/cards/core/types/billing-change-preview';

interface BillingKey extends BillingDays {
  readonly cardId: string;
}

/**
 * Prévia da mudança de fechamento/vencimento (S-128, T69): a primeira fatura afetada, as parcelas e
 * os créditos que mudam de fatura, **como recebidos**. Só é pedida quando um dia mudou. O
 * `effectiveFromClosingDate` recebido é o que o `PUT` devolve como `confirmedEffectiveFrom`.
 * Escopo de componente.
 */
@Injectable()
export class BillingChangePreviewFacade {
  private readonly gateway = inject(CardsGateway);
  private readonly preview = new DebouncedPreview<BillingKey, BillingChangePreview>((key) =>
    this.gateway.previewBillingChange(key.cardId, key.closingDay, key.dueDay),
  );

  readonly state = this.preview.state;
  readonly data = this.preview.data;
  readonly loading = this.preview.loading;
  readonly problem = this.preview.problem;

  /** `null` (nenhum dia mudou, ou valor inválido) limpa a prévia sem pedir nada. */
  request(cardId: string, days: BillingDays | null): void {
    this.preview.request(days === null ? null : { cardId, ...days });
  }
}
