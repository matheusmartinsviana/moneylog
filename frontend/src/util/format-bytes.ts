/** Tamanho legível (`1,5 MB`) no idioma informado. Só exibição: nenhum limite é decidido por este texto. */
export function formatBytes(bytes: number, locale: string): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || Number.isInteger(value) ? 0 : 1;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value)} ${units[unit]}`;
}
