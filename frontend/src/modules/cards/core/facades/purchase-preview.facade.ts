import { inject, Injectable } from '@angular/core';

import { DebouncedPreview } from '~/modules/cards/core/facades/debounced-preview';
import { CardsGateway } from '~/modules/cards/core/interfaces/cards.gateway';
import type {
  PurchasePreview,
  PurchasePreviewRequest,
} from '~/modules/cards/core/types/purchase-preview';

interface PurchaseKey extends PurchasePreviewRequest {
  readonly cardId: string;
}

/**
 * Prévia da compra no cartão (S-124, T67): parcelas, fatura alvo, `LATE_ENTRY`/`OVER_LIMIT` e o limite
 * depois da compra, **como o backend devolveu**. O front não divide o valor nem escolhe a fatura:
 * quem usa só mostra `preview()`. Escopo de componente.
 */
@Injectable()
export class PurchasePreviewFacade {
  private readonly gateway = inject(CardsGateway);
  private readonly preview = new DebouncedPreview<PurchaseKey, PurchasePreview>((key) =>
    this.gateway.previewPurchase(key.cardId, {
      amount: key.amount,
      installments: key.installments,
      date: key.date,
    }),
  );

  readonly state = this.preview.state;
  readonly data = this.preview.data;
  readonly loading = this.preview.loading;
  readonly problem = this.preview.problem;

  /** Valor, parcelas e data digitados; `null` (dados incompletos) limpa a prévia. */
  request(cardId: string, request: PurchasePreviewRequest | null): void {
    this.preview.request(request === null ? null : { cardId, ...request });
  }
}
