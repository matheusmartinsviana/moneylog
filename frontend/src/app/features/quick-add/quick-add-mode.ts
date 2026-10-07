/** Modos do `/quick-add` (S-69). O modo vem da URL (`?mode=`), para atalhos do iOS/Android. */
export const MAIN_MODES = [
  'expense',
  'pix',
  'debit',
  'income',
  'transfer',
  'credit',
  'loan',
] as const;
/** "Mais tipos": os demais tipos em conta desta etapa. */
export const MORE_MODES = ['investment', 'adjustment', 'refund'] as const;
/** "Pessoas e dívidas": receber e registrar uma dívida ("Emprestei" é um modo principal). */
export const PEOPLE_MODES = ['received', 'debt'] as const;
/** Modos que carregam pessoas (inclui `loan`). */
export const PEOPLE_DATA_MODES = ['loan', ...PEOPLE_MODES] as const;
export const QUICK_ADD_MODES = [...MAIN_MODES, ...MORE_MODES, ...PEOPLE_MODES] as const;
export type QuickAddMode = (typeof QUICK_ADD_MODES)[number];

export const DEFAULT_MODE: QuickAddMode = 'expense';

/** Modo pedido na URL (`?mode=credit` abre a compra no cartão, S-132); valor desconhecido vira o padrão. */
export function parseMode(value: string | null): QuickAddMode {
  return QUICK_ADD_MODES.find((mode) => mode === value) ?? DEFAULT_MODE;
}

/** Grupos do seletor "Tipo de registro" (um único `app-select` agrupado). */
export const MODE_GROUPS = [
  { key: 'spending', modes: ['expense', 'pix', 'debit', 'credit'] },
  { key: 'inflow', modes: ['income'] },
  { key: 'between', modes: ['transfer', 'investment'] },
  { key: 'people', modes: ['loan', 'received', 'debt'] },
  { key: 'other', modes: ['refund', 'adjustment'] },
] as const satisfies readonly { key: string; modes: readonly QuickAddMode[] }[];
