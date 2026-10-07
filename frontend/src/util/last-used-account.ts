import { readStorage, writeStorage } from '~/util/safe-storage';

const KEY = 'moneylog.quickAdd.lastAccountId';

/** A última conta usada no `/quick-add` (preferência local, S-69); `null` se nunca houve ou o storage falha. */
export function readLastUsedAccount(): string | null {
  const value = readStorage(KEY);
  return value !== null && value !== '' ? value : null;
}

export function writeLastUsedAccount(accountId: string): void {
  writeStorage(KEY, accountId);
}
