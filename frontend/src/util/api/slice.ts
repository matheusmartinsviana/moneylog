/** Página de uma lista paginada do contrato (`Slice`): sem `COUNT`, só `hasNext`. */
export interface Slice<T> {
  readonly items: readonly T[];
  readonly hasNext: boolean;
}

/** Página de ocorrências: avisa quando as vencidas passaram do limite de 500 por chamada (S-240). */
export interface OccurrenceSlice<T> extends Slice<T> {
  readonly overdueTruncated: boolean;
}

/** Tamanho de página máximo do contrato (S-91): o que os selects pedem. */
export const MAX_PAGE_SIZE = 50;
