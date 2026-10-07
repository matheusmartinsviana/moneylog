/** Esquemas de link que o renderizador aceita (S-159): nada de `javascript:`, `data:`, `vbscript:`, `file:`, `blob:`. */
const EXTERNAL_PROTOCOLS = ['http:', 'https:'];
const CONTACT_PROTOCOLS = ['mailto:'];
const MAX_URL_LENGTH = 2048;

export interface SafeLink {
  /** URL normalizada pelo `URL` do navegador (já codificada). */
  readonly href: string;
  /** `http(s)`: abre em outra aba, com `rel="noopener noreferrer"`. `mailto:` não. */
  readonly external: boolean;
}

/**
 * Decide se uma URL escrita na nota pode virar link. **Lista permitida**, não lista de bloqueio: só `http:`,
 * `https:` e `mailto:` passam. O que não tem esquema (relativo, `//host`, `#âncora`, `foo.md`) e qualquer
 * outro esquema (`javascript:`, `data:`, `vbscript:`, `file:`, `blob:`, `about:`...) volta `null` e o texto
 * aparece sem link. O parser de URL do navegador remove tabulações, quebras de linha e espaços do começo
 * (`java\tscript:`, `\u0001javascript:`), então o esquema avaliado é o **real**, não o que parece.
 */
export function safeLink(href: string): SafeLink | null {
  const raw = href.trim();
  if (raw === '' || raw.length > MAX_URL_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (EXTERNAL_PROTOCOLS.includes(url.protocol)) {
    // `http://user:senha@host` serviria para enganar sobre o destino: não vira link.
    if (url.username !== '' || url.password !== '') return null;
    return { href: url.href, external: true };
  }
  if (CONTACT_PROTOCOLS.includes(url.protocol)) return { href: url.href, external: false };
  return null;
}
