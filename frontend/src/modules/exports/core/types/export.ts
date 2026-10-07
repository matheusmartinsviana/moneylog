/** Um arquivo pronto para o usuário guardar: o conteúdo e o nome que o backend sugeriu. */
export interface DownloadedFile {
  readonly blob: Blob;
  readonly filename: string;
}

/** Filtro da exportação de movimentações (período por data de lançamento, `YYYY-MM-DD`). */
export interface TransactionsExportQuery {
  readonly from: string | null;
  readonly to: string | null;
  /**
   * Idioma da interface (`pt`, `en`, `es`). O backend só tem cabeçalho de CSV em `pt` e `en` (`CsvHeaders`):
   * qualquer outro idioma sairia em português. Por isso o front envia `csvHeaderLanguage(language)` (`pt` ou
   * `en`) no `Accept-Language`, e a tela avisa quando o idioma do app não tem cabeçalho próprio (FE-S-167).
   * `null` deixa o padrão do navegador.
   */
  readonly language?: string | null;
}

/** Idiomas com cabeçalho de CSV próprio no backend. */
export const CSV_HEADER_LANGUAGES = ['pt', 'en'] as const;

/** O idioma do app tem cabeçalho de CSV próprio? */
export function hasCsvHeader(language: string): boolean {
  return (CSV_HEADER_LANGUAGES as readonly string[]).includes(language);
}

/** O que enviar no `Accept-Language`: o idioma, se o backend o trata; senão `pt` (o padrão dele). */
export function csvHeaderLanguage(language: string): (typeof CSV_HEADER_LANGUAGES)[number] {
  return language === 'en' ? 'en' : 'pt';
}

export type ExportKind = 'csv' | 'backup';
