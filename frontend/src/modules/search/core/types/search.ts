import type { Money } from '~/util/money';

/** Grupos do resultado, na ordem em que a tela os mostra. */
export const SEARCH_GROUPS = ['transactions', 'accounts', 'categories', 'cards', 'notes'] as const;
export type SearchGroup = (typeof SEARCH_GROUPS)[number];

export interface SearchRef {
  readonly id: string;
  readonly name: string;
}

export interface SearchTransaction {
  readonly id: string;
  readonly description: string;
  /** `YYYY-MM-DD`. */
  readonly date: string;
  /** Valor como a API devolveu, sem total nem soma. */
  readonly amount: Money;
  /** `TransactionType` do contrato (`EXPENSE`, `INCOME`...). */
  readonly type: string;
  readonly category: SearchRef | null;
  readonly account: SearchRef | null;
}

export interface SearchAccount {
  readonly id: string;
  readonly name: string;
  readonly institution: string | null;
  readonly type: string;
  /** `ACTIVE` | `ARCHIVED`: arquivados vêm por último e marcados. */
  readonly status: string;
}

export interface SearchCategory {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly archived: boolean;
}

export interface SearchCard {
  readonly id: string;
  readonly name: string;
  readonly institution: string | null;
  readonly status: string;
}

export interface SearchNote {
  readonly id: string;
  readonly title: string;
  readonly path: string;
  /** **Texto puro** (nunca Markdown nem HTML), até 160 caracteres: exibir sempre como texto. */
  readonly snippet: string;
}

/** `GET /v1/search`: só campos de exibição e de rota; nenhum total. */
export interface SearchResults {
  /** O termo já aparado pelo backend. */
  readonly q: string;
  readonly transactions: readonly SearchTransaction[];
  readonly accounts: readonly SearchAccount[];
  readonly categories: readonly SearchCategory[];
  readonly cards: readonly SearchCard[];
  readonly notes: readonly SearchNote[];
  /** Grupos cuja leitura estourou o limite de tempo (vêm vazios): "resultados parciais". */
  readonly truncated: readonly SearchGroup[];
}
