import { MAX_IMPORT_BYTES } from '~/modules/notes/core/types/note';

export type ImportFileProblem = 'NOT_ZIP' | 'TOO_LARGE' | 'EMPTY';

/**
 * Confere o arquivo escolhido **antes** de enviar (o backend é a verdade e confere os bytes mágicos): extensão
 * `.zip`, não vazio e até 20 MB. Um arquivo acima disso nem sobe (o backend também recusa com 422).
 */
export function importFileProblem(file: { name: string; size: number }): ImportFileProblem | null {
  if (!/\.zip$/i.test(file.name)) return 'NOT_ZIP';
  if (file.size === 0) return 'EMPTY';
  if (file.size > MAX_IMPORT_BYTES) return 'TOO_LARGE';
  return null;
}
