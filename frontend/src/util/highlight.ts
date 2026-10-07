export interface TextSegment {
  readonly text: string;
  readonly match: boolean;
}

/** Letra "dobrada" para comparar: sem acento e sem caixa (o backend busca assim, `unaccent` + `ILIKE`). */
function fold(char: string): string {
  return char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * Parte `text` em trechos, marcando onde `term` aparece **sem diferenciar caixa nem acento**. Devolve só
 * texto (o chamador desenha o trecho marcado com `<mark>`, sem HTML injetado). Termo vazio: um trecho só.
 */
export function highlightSegments(text: string, term: string): readonly TextSegment[] {
  const needle = [...term.trim()].map(fold).join('');
  if (needle === '' || text === '') return [{ text, match: false }];
  let folded = '';
  // `origin[i]` = índice em `text` do caractere que gerou a posição `i` do texto dobrado.
  const origin: number[] = [];
  let index = 0;
  for (const char of text) {
    const piece = fold(char);
    folded += piece;
    origin.push(...Array.from({ length: piece.length }, () => index));
    index += char.length;
  }
  const segments: TextSegment[] = [];
  let cursor = 0;
  let from = 0;
  for (;;) {
    const at = folded.indexOf(needle, from);
    if (at < 0) break;
    const start = origin[at] ?? 0;
    const last = origin[at + needle.length - 1] ?? start;
    // O fim cobre o caractere inteiro (um par substituto ou uma letra com acento decomposta).
    const end = last + (text.codePointAt(last)! > 0xffff ? 2 : 1);
    if (start > cursor) segments.push({ text: text.slice(cursor, start), match: false });
    segments.push({ text: text.slice(start, end), match: true });
    cursor = end;
    from = at + needle.length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: false });
  return segments.length > 0 ? segments : [{ text, match: false }];
}
