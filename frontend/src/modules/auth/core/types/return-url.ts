/**
 * `returnUrl` só pode ser um caminho interno do app (evita open redirect): começa com uma única
 * `/`, sem `//`, `\` nem esquema. Qualquer outra coisa vira `/` (T33 CA2).
 */
export function safeReturnUrl(value: unknown): string {
  if (typeof value !== 'string' || value === '') return '/';
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  // Caracteres de controle e quebras de linha não fazem parte de um caminho legítimo.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return '/';
  return value;
}
