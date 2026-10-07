import type { Problem } from '~/util/api/problem';

export type ImportApplyCause =
  'IMPORT_LINE_ALREADY_RECORDED' | 'IMPORT_TRANSFER_LEG_ALREADY_RECORDED' | 'OTHER';

export interface ImportApplyFailure {
  /** Posição da linha no arquivo (1 = primeira), quando o backend a informa. */
  readonly position: number | null;
  readonly cause: ImportApplyCause;
}

const KNOWN_CAUSES: readonly ImportApplyCause[] = [
  'IMPORT_LINE_ALREADY_RECORDED',
  'IMPORT_TRANSFER_LEG_ALREADY_RECORDED',
];

function causeOf(raw: string | null | undefined, detail: string): ImportApplyCause {
  const found = KNOWN_CAUSES.find((known) => known === raw);
  if (found) return found;
  if (raw) return 'OTHER'; // `cause` informado e desconhecido: não adivinha pelo texto.
  return KNOWN_CAUSES.find((known) => detail.includes(known)) ?? 'OTHER';
}

/**
 * `IMPORT_APPLY_FAILED` traz `position` e `cause` (contrato 2.10.0). O regex sobre `detail` fica só
 * como fallback de backend antigo. `cause` desconhecida vira `OTHER`; `position` ausente, `null`.
 */
export function applyFailureOf(problem: Problem | null): ImportApplyFailure | null {
  if (problem?.code !== 'IMPORT_APPLY_FAILED') return null;
  const detail = problem.detail ?? '';
  const match = /(?:linha|line|línea)\s*#?\s*(\d+)/i.exec(detail);
  const position =
    typeof problem.position === 'number'
      ? problem.position
      : match?.[1]
        ? Number.parseInt(match[1], 10)
        : null;
  return { position, cause: causeOf(problem.cause, detail) };
}
