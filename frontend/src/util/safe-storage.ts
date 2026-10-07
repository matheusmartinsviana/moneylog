/**
 * Acesso ao localStorage que nunca quebra a tela: em aba privada, storage bloqueado ou
 * ambiente sem `window`, as leituras devolvem `null` e as escritas são ignoradas.
 */
function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readStorage(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    storage()?.setItem(key, value);
  } catch {
    // Preferência só deixa de persistir; a tela continua funcionando.
  }
}

export function removeStorage(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // Idem.
  }
}
