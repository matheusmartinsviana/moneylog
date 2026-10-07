import type { Money } from '~/util/money';

/**
 * Espelho de `Upcoming` (docs/arquitetura/arquitetura.md §4.4): o que pagar ou receber a seguir.
 * `bucket` e `totals` vêm prontos do backend (no fuso do usuário); o front não usa o relógio do
 * aparelho nem soma os itens.
 */
export const UPCOMING_BUCKETS = [
  'OVERDUE',
  'TODAY',
  'TOMORROW',
  'NEXT_7_DAYS',
  'NEXT_30_DAYS',
  'LATER',
] as const;
export type UpcomingBucket = (typeof UPCOMING_BUCKETS)[number];

export type UpcomingKind =
  | 'INVOICE'
  | 'INVOICE_FORECAST'
  | 'DEBT_PAYABLE'
  | 'DEBT_RECEIVABLE'
  | 'RECURRENCE'
  | 'SCHEDULED_TRANSACTION';

export type UpcomingDirection = 'IN' | 'OUT';

/** Parcela aninhada numa fatura: só informativa, já incluída no valor da fatura e nunca somada. */
export interface UpcomingInstallment {
  readonly kind: 'INSTALLMENT';
  readonly label: string;
  readonly installment: { readonly number: number; readonly total: number };
  readonly amount: Money;
  readonly informational: true;
}

export interface UpcomingItem {
  readonly kind: UpcomingKind;
  /** `null` nos itens de `undated` (dívida sem `expectedDate`). */
  readonly bucket: UpcomingBucket | null;
  /** `YYYY-MM-DD`; `null` nos itens de `undated`. */
  readonly dueDate: string | null;
  readonly direction: UpcomingDirection;
  readonly amount: Money;
  readonly label: string;
  readonly refType: string;
  /** `null` quando o item não aponta para um registro (contrato: `refId` anulável). */
  readonly refId: string | null;
  /** Parcelas da fatura (vazio para os demais tipos). */
  readonly items: readonly UpcomingInstallment[];
}

export interface Upcoming {
  readonly items: readonly UpcomingItem[];
  readonly undated: readonly UpcomingItem[];
  readonly totals: { readonly out: Money; readonly in: Money };
  /**
   * `true` quando havia mais ocorrências vencidas que o limite de 500 por chamada: só as mais
   * recentes vêm em `items` (os `totals` continuam completos). Só avisa; nada é calculado (S-240).
   */
  readonly overdueTruncated: boolean;
}
