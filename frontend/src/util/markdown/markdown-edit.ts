/**
 * Edições de texto do editor Markdown, **puras** (texto + seleção → o que trocar e onde ficar o cursor). O
 * componente aplica o resultado com `replaceRange`. Nada aqui toca o DOM nem valores financeiros.
 */

export interface Selection {
  readonly start: number;
  readonly end: number;
}

/** Troca `[from, to)` por `insert` e deixa a seleção em `[selectStart, selectEnd]` (posições no texto novo). */
export interface Edit {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
  readonly selectStart: number;
  readonly selectEnd: number;
}

/** Negrito (`**`), itálico (`*`) e código (`` ` ``): liga e desliga o marcador em volta da seleção. */
export function toggleWrap(text: string, selection: Selection, marker: string): Edit {
  const { start, end } = selection;
  const selected = text.slice(start, end);
  const before = text.slice(Math.max(0, start - marker.length), start);
  const after = text.slice(end, end + marker.length);
  // Já envolvido por fora da seleção: tira.
  if (before === marker && after === marker) {
    return {
      from: start - marker.length,
      to: end + marker.length,
      insert: selected,
      selectStart: start - marker.length,
      selectEnd: end - marker.length,
    };
  }
  // A seleção já inclui os marcadores: tira.
  if (
    selected.length >= marker.length * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker)
  ) {
    const inner = selected.slice(marker.length, selected.length - marker.length);
    return {
      from: start,
      to: end,
      insert: inner,
      selectStart: start,
      selectEnd: start + inner.length,
    };
  }
  if (selected === '') {
    // Sem seleção: abre e fecha o marcador com o cursor no meio.
    return {
      from: start,
      to: end,
      insert: marker + marker,
      selectStart: start + marker.length,
      selectEnd: start + marker.length,
    };
  }
  return {
    from: start,
    to: end,
    insert: marker + selected + marker,
    selectStart: start + marker.length,
    selectEnd: start + marker.length + selected.length,
  };
}

/** Link `[texto](url)`: o texto é a seleção e a `url` fica selecionada para ser digitada. */
export function insertLink(text: string, selection: Selection): Edit {
  const { start, end } = selection;
  const selected = text.slice(start, end);
  const label = selected === '' ? 'texto' : selected;
  const insert = `[${label}](url)`;
  const urlStart = start + label.length + 3;
  return { from: start, to: end, insert, selectStart: urlStart, selectEnd: urlStart + 3 };
}

/** Link para outra nota `[[nota]]`: envolve a seleção; sem seleção, deixa o cursor entre os colchetes. */
export function insertWikilink(text: string, selection: Selection): Edit {
  const { start, end } = selection;
  const selected = text.slice(start, end);
  return {
    from: start,
    to: end,
    insert: `[[${selected}]]`,
    selectStart: start + 2,
    selectEnd: start + 2 + selected.length,
  };
}

/** Início da linha que contém `index`. */
function lineStart(text: string, index: number): number {
  // `lastIndexOf('\n', -1)` olha o índice 0 e acharia a quebra de uma linha 0 vazia (`\nabc`).
  return index <= 0 ? 0 : text.lastIndexOf('\n', index - 1) + 1;
}

/** Fim (sem a quebra) da linha que contém `index`. */
function lineEnd(text: string, index: number): number {
  const at = text.indexOf('\n', index);
  return at < 0 ? text.length : at;
}

/** Liga ou desliga um prefixo (`- `, `> `) em todas as linhas tocadas pela seleção. */
export function toggleLinePrefix(text: string, selection: Selection, prefix: string): Edit {
  const from = lineStart(text, selection.start);
  // Uma seleção que termina no começo de uma linha não toca essa linha.
  const endIndex =
    selection.end > selection.start && text[selection.end - 1] === '\n'
      ? selection.end - 1
      : selection.end;
  const to = lineEnd(text, endIndex);
  const lines = text.slice(from, to).split('\n');
  const allPrefixed = lines.every((line) => line.startsWith(prefix));
  const next = lines.map((line) => (allPrefixed ? line.slice(prefix.length) : prefix + line));
  const insert = next.join('\n');
  const delta = (allPrefixed ? -1 : 1) * prefix.length;
  const selectStart = Math.max(from, selection.start + delta);
  return {
    from,
    to,
    insert,
    selectStart,
    selectEnd: Math.max(selectStart, selection.end + delta * lines.length),
  };
}

const INDENT = '  ';

/**
 * `Tab` recua e `Shift+Tab` desfaz o recuo. Sem seleção multilinha, `Tab` insere o recuo no cursor; com
 * seleção de várias linhas, recua todas.
 */
export function indent(text: string, selection: Selection, outdent: boolean): Edit | null {
  const { start, end } = selection;
  const multiline = text.slice(start, end).includes('\n');
  if (!outdent && !multiline) {
    return {
      from: start,
      to: end,
      insert: INDENT,
      selectStart: start + INDENT.length,
      selectEnd: start + INDENT.length,
    };
  }
  const from = lineStart(text, start);
  const to = lineEnd(text, end > start && text[end - 1] === '\n' ? end - 1 : end);
  const lines = text.slice(from, to).split('\n');
  let removedFirst = 0;
  let removedTotal = 0;
  const next = lines.map((line, index) => {
    if (!outdent) return INDENT + line;
    const match = /^( {1,2}|\t)/.exec(line);
    const removed = match ? match[0].length : 0;
    if (index === 0) removedFirst = removed;
    removedTotal += removed;
    return line.slice(removed);
  });
  if (outdent && removedTotal === 0) return null;
  const insert = next.join('\n');
  if (!outdent) {
    return {
      from,
      to,
      insert,
      selectStart: start + INDENT.length,
      selectEnd: end + INDENT.length * lines.length,
    };
  }
  return {
    from,
    to,
    insert,
    selectStart: Math.max(from, start - removedFirst),
    selectEnd: Math.max(from, end - removedTotal),
  };
}

/** O que o usuário está digitando dentro de `[[...`: onde começa o alvo e o texto até o cursor. */
export interface WikilinkContext {
  /** Índice do primeiro caractere depois de `[[`. */
  readonly start: number;
  readonly query: string;
}

/**
 * O cursor está dentro de um `[[` ainda aberto (na mesma linha, sem `]` nem outro `[` no meio)? Devolve onde
 * o alvo começa e o que já foi digitado; senão `null`. Não lê dentro de blocos de código (cerca ` ``` `).
 */
export function wikilinkContext(text: string, caret: number): WikilinkContext | null {
  const lineFrom = lineStart(text, caret);
  const before = text.slice(lineFrom, caret);
  const open = before.lastIndexOf('[[');
  if (open < 0) return null;
  const query = before.slice(open + 2);
  if (/[\][\n]/.test(query) || query.length > 120) return null;
  // Dentro de uma cerca de código aberta (número ímpar de ``` antes): não sugere.
  const fences = (text.slice(0, lineFrom).match(/^(```|~~~)/gm) ?? []).length;
  if (fences % 2 === 1) return null;
  return { start: lineFrom + open + 2, query };
}

/** Troca o que foi digitado depois de `[[` pelo alvo escolhido e fecha com `]]` (sem duplicar o que já existe). */
export function completeWikilink(
  text: string,
  context: WikilinkContext,
  caret: number,
  target: string,
): Edit {
  const closing = text.slice(caret, caret + 2) === ']]' ? 2 : 0;
  const insert = `${target}]]`;
  return {
    from: context.start,
    to: caret + closing,
    insert,
    selectStart: context.start + insert.length,
    selectEnd: context.start + insert.length,
  };
}
