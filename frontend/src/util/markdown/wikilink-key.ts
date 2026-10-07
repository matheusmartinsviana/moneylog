/** Chave de comparação de um alvo de wikilink: sem `.md`, sem acento, sem caixa, espaços colapsados. */
export function wikilinkKey(target: string): string {
  return target
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.md$/i, '')
    .toLowerCase();
}
