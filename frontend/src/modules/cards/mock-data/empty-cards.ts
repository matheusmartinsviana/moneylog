import type {
  CardSliceResponse,
  InvoiceSliceResponse,
} from '~/modules/cards/infra/responses/card.response';

/** Ambiente mock (S-67): o usuário ainda não tem cartão. Mesmo formato bruto da API. */
export const EMPTY_CARDS: CardSliceResponse = { items: [], hasNext: false };
export const EMPTY_INVOICES: InvoiceSliceResponse = { items: [], hasNext: false };
