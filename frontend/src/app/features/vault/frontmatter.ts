export interface FrontmatterEntry {
  readonly key: string;
  readonly value: string;
}

export interface SplitNote {
  /** Pares `chave: valor` do bloco de metadados (`---`); `null` quando a nota não tem bloco. */
  readonly meta: readonly FrontmatterEntry[] | null;
  /** O corpo sem o bloco de metadados. */
  readonly content: string;
}

const BLOCK = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * Separa o bloco de metadados (frontmatter) do corpo de uma nota para a prévia do vault. Só texto: as chaves e os
 * valores vão para a tela por interpolação (escapados), nunca como HTML. Linhas que não são `chave: valor` ficam
 * de fora da lista (o corpo da nota continua intacto no editor).
 */
export function splitFrontmatter(body: string): SplitNote {
  const match = BLOCK.exec(body);
  if (!match) return { meta: null, content: body };
  const meta: FrontmatterEntry[] = [];
  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    const at = line.indexOf(':');
    if (at <= 0) continue;
    const key = line.slice(0, at).trim();
    if (!/^[\w.-]+$/.test(key)) continue;
    meta.push({ key, value: line.slice(at + 1).trim() });
  }
  return { meta, content: body.slice(match[0].length) };
}
