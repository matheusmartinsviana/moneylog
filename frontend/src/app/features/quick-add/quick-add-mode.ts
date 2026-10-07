/** Modos do `/quick-add` (S-69). O modo vem da URL (`?mode=`), para atalhos do iOS/Android. */
export const MAIN_MODES = ['expense', 'pix', 'debit', 'income', 'transfer', 'credit'] as const;
/** "Mais tipos": os demais tipos em conta desta etapa. */
export const MORE_MODES = ['investment', 'adjustment', 'refund'] as const;
/** "Pessoas e dívidas" (Etapa 4): emprestar, receber e registrar uma dívida. */
export const PEOPLE_MODES = ['loan', 'received', 'debt'] as const;
export const QUICK_ADD_MODES = [...MAIN_MODES, ...MORE_MODES, ...PEOPLE_MODES] as const;
export type QuickAddMode = (typeof QUICK_ADD_MODES)[number];

export const DEFAULT_MODE: QuickAddMode = 'expense';

/** Modo pedido na URL (`?mode=credit` abre a compra no cartão, S-132); valor desconhecido vira o padrão. */
export function parseMode(value: string | null): QuickAddMode {
  return QUICK_ADD_MODES.find((mode) => mode === value) ?? DEFAULT_MODE;
}
