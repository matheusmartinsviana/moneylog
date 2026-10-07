/** Controles C0/C1, invisíveis (`U+200B..200F`), separadores, bidi (`U+202A..202E`, `U+2066..2069`) e BOM. */
const CONTROL_AND_BIDI =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;

/** Tamanho máximo do nome do arquivo, extensão incluída. */
export const MAX_FILENAME_LENGTH = 100;

/** Nome bruto do `Content-Disposition` (`filename*=UTF-8''...` ou `filename="..."`), sem nenhuma limpeza. */
function rawFilename(header: string): string | null {
  const extended = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  const quoted = /filename\s*=\s*"((?:[^"\\]|\\.)*)"/.exec(header);
  const bare = /filename\s*=\s*([^;"\s]+)/.exec(header);
  let raw = extended?.[1] ?? quoted?.[1] ?? bare?.[1] ?? null;
  if (raw === null) return null;
  if (extended) {
    try {
      raw = decodeURIComponent(raw);
    } catch {
      return null;
    }
  }
  return raw.replace(/\\(.)/g, '$1');
}

/**
 * Nome do arquivo do `Content-Disposition`, **endurecido** (defesa em profundidade; o nome vem do nosso
 * backend e ainda aparece na tela): só o último trecho do caminho; sem controles nem caracteres bidi/invisíveis
 * (`U+202E` inverteria a extensão exibida); allowlist `[letras números . _ -]` (o resto vira `_`); sem ponto
 * inicial nem final; no máximo {@link MAX_FILENAME_LENGTH} caracteres. A extensão é a de `fallback`
 * (`.csv`/`.json`): se o nome não terminar nela, vale o `fallback` inteiro. Sem header utilizável, também.
 */
export function safeFilenameFromContentDisposition(
  header: string | null,
  fallback: string,
): string {
  if (header === null) return fallback;
  const raw = rawFilename(header);
  if (raw === null) return fallback;
  const extension = /\.[A-Za-z0-9]+$/.exec(fallback)?.[0] ?? '';
  const cleaned = (raw.split(/[\\/]/).pop() ?? '')
    .replace(CONTROL_AND_BIDI, '')
    .replace(/[^\p{L}\p{N}._-]/gu, '_')
    .normalize('NFC');
  if (extension === '' || !cleaned.toLowerCase().endsWith(extension.toLowerCase())) return fallback;
  const base = cleaned
    .slice(0, cleaned.length - extension.length)
    .replace(/^[.]+|[.]+$/g, '')
    .slice(0, MAX_FILENAME_LENGTH - extension.length);
  if (/^[._-]*$/.test(base)) return fallback;
  return base + extension.toLowerCase();
}
