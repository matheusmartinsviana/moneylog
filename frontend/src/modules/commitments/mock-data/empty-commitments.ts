import type { CommitmentSliceResponse } from '~/modules/commitments/infra/responses/commitment.response';

/** Ambiente mock (S-67): nenhum compromisso. Mesmo formato bruto da API. */
export function emptyCommitments(): CommitmentSliceResponse {
  return { items: [], hasNext: false };
}
