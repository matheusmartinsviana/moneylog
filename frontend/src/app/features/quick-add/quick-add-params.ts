/** Tamanho máximo da descrição de uma movimentação (contrato). */
const MAX_DESCRIPTION = 200;

/**
 * Texto vindo da URL (`/quick-add?description=` ou o compartilhamento `text`/`title`): tira marcação HTML e
 * caracteres de controle, junta espaços e corta em 200. A tela só mostra o resultado como texto e **nada é
 * salvo** sem a pessoa confirmar o formulário.
 */
export function sanitizeSharedText(raw: string | null): string {
  if (raw === null) return '';
  return raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_DESCRIPTION);
}
