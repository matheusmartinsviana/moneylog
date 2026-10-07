import { readStorage, writeStorage } from '~/util/safe-storage';

const KEY = 'moneylog.quickAdd.lastCardId';

/** O último cartão usado no `/quick-add` em modo Crédito (preferência local, T67 CA1); `null` se nunca houve. */
export function readLastUsedCard(): string | null {
  const value = readStorage(KEY);
  return value !== null && value !== '' ? value : null;
}

export function writeLastUsedCard(cardId: string): void {
  writeStorage(KEY, cardId);
}
