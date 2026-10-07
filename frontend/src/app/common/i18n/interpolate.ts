/**
 * Preenche os parâmetros `{nome}` de um texto traduzido. Evita montar frases concatenando pedaços
 * (a ordem das palavras muda entre idiomas, FE 04). Parâmetro ausente fica visível como `{nome}`.
 */
export function interpolate(template: string, params: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) => params[key] ?? placeholder);
}
