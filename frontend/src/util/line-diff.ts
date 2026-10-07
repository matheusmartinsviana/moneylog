export interface DiffLine {
  readonly kind: 'same' | 'added' | 'removed';
  readonly text: string;
}

/** Acima disto (linhas de cada texto) a comparação é recusada, mesmo com o produto pequeno (F6). */
export const MAX_DIFF_LINES = 20_000;

/** Acima disto (linhas × linhas) a comparação é recusada: a memória cresce com o produto. */
export const MAX_DIFF_CELLS = 2_000_000;

/**
 * Diferença linha a linha entre o texto **do servidor** (`remote`) e o **digitado** (`mine`), pelo maior
 * subconjunto comum. `added` = só no texto do usuário; `removed` = só no do servidor. Devolve `null` se o
 * texto é grande demais para comparar (a tela oferece as duas escolhas sem a diferença). Só texto: nenhuma
 * linha vira marcação.
 */
export function lineDiff(remote: string, mine: string): readonly DiffLine[] | null {
  const a = remote.split('\n');
  const b = mine.split('\n');
  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) return null;
  if ((a.length + 1) * (b.length + 1) > MAX_DIFF_CELLS) return null;
  const width = b.length + 1;
  const table = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] =
        a[i] === b[j]
          ? table[(i + 1) * width + j + 1]! + 1
          : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i]! });
      i++;
      j++;
    } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) {
      out.push({ kind: 'removed', text: a[i]! });
      i++;
    } else {
      out.push({ kind: 'added', text: b[j]! });
      j++;
    }
  }
  for (; i < a.length; i++) out.push({ kind: 'removed', text: a[i]! });
  for (; j < b.length; j++) out.push({ kind: 'added', text: b[j]! });
  return out;
}
