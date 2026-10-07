import type { Problem } from '~/util/api/problem';

export type ImportApplyCause =
  'IMPORT_LINE_ALREADY_RECORDED' | 'IMPORT_TRANSFER_LEG_ALREADY_RECORDED' | 'OTHER';

export interface ImportApplyFailure {
  /** Posição da linha no arquivo (1 = primeira), quando o backend a informa. */
  readonly position: number | null;
  readonly cause: ImportApplyCause;
}

/**
 * `IMPORT_APPLY_FAILED` traz a linha e a causa só no `detail`; extraímos o mínimo para a tela oferecer
 * rejeitar a linha ou descartar o lote. Sem causa conhecida cai em `OTHER` (mensagem genérica).
 */
export function applyFailureOf(problem: Problem | null): ImportApplyFailure | null {
  if (problem?.code !== 'IMPORT_APPLY_FAILED') return null;
  const detail = problem.detail ?? '';
  const cause: ImportApplyCause = detail.includes('IMPORT_TRANSFER_LEG_ALREADY_RECORDED')
    ? 'IMPORT_TRANSFER_LEG_ALREADY_RECORDED'
    : detail.includes('IMPORT_LINE_ALREADY_RECORDED')
      ? 'IMPORT_LINE_ALREADY_RECORDED'
      : 'OTHER';
  const match = /(?:linha|line|línea)\s*#?\s*(\d+)/i.exec(detail);
  return { position: match?.[1] ? Number.parseInt(match[1], 10) : null, cause };
}
