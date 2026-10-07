import { en } from '~/app/common/i18n/translations/en';
import { es } from '~/app/common/i18n/translations/es';
import { pt } from '~/app/common/i18n/translations/pt';

function leaves(tree: object, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string'
      ? [[`${prefix}${key}`, value] as [string, string]]
      : leaves(value as object, `${prefix}${key}.`),
  );
}

/**
 * Palavras que podem aparecer com maiúscula no meio da frase: nomes próprios, siglas, marcas
 * e nomes de idioma (que se escrevem com maiúscula no próprio idioma).
 */
const PROPER_NOUNS = new Set([
  'Markdown',
  'Monelog',
  'CSV',
  'JSON',
  'OFX',
  'IA',
  'AI',
  'Brasil',
  'English',
  'Español',
  'Português',
  'Pix',
  'CVV',
  // Nomes de teclas.
  'Enter',
  'Esc',
  'Tab',
  'Obsidian',
  'Anthropic',
  'Claude',
  'Code',
  'MCP',
  'KB',
  'MB',
  'XLSX',
  'PDF',
  'UTF-8',
]);

function sentenceCaseProblems(text: string): string[] {
  const raw = text.split(/\s+/);
  const clean = (w: string) => w.replace(/^[“"(]+|[”"),.:;!?]+$/g, '');
  return raw
    .map((word, i) => ({ word: clean(word), afterSentenceEnd: /[.!?]$/.test(raw[i - 1] ?? '') }))
    .slice(1)
    .filter(
      ({ word, afterSentenceEnd }) =>
        /^\p{Lu}/u.test(word) && !afterSentenceEnd && !PROPER_NOUNS.has(word),
    )
    .map(({ word }) => word);
}

/** Nome único da ação e da página `/quick-add` (S-57). */
const NEW_ENTRY = { pt: 'Novo registro', en: 'New entry', es: 'Nuevo registro' } as const;

describe('Traduções', () => {
  const languages = { pt, en, es };
  const ptKeys = leaves(pt)
    .map(([key]) => key)
    .sort();

  it.each(Object.entries(languages))(
    'Dado %s, então tem exatamente as mesmas chaves que pt',
    (_, dict) => {
      expect(
        leaves(dict)
          .map(([key]) => key)
          .sort(),
      ).toEqual(ptKeys);
    },
  );

  it.each(Object.entries(languages))('Dado %s, então nenhum texto está vazio', (_, dict) => {
    expect(leaves(dict).filter(([, value]) => value.trim() === '')).toEqual([]);
  });

  it.each(Object.entries(languages))(
    'Dado %s, então todos os textos estão em sentence case',
    (_, dict) => {
      const problems = leaves(dict)
        // Máscaras de data (dd/mm/aaaa) são formato, não frase.
        .filter(([key]) => key !== 'shell.brand' && key !== 'form.date.placeholder')
        .flatMap(([key, value]) => {
          const first = value.trim()[0] ?? '';
          const startsLower = /\p{Ll}/u.test(first);
          const issues = sentenceCaseProblems(value);
          return startsLower || issues.length > 0 ? [`${key}: "${value}"`] : [];
        });
      expect(problems).toEqual([]);
    },
  );

  it.each(Object.entries(languages))(
    'Dado %s, então "captura rápida" não aparece e /quick-add tem um nome só (S-57)',
    (language, dict) => {
      const texts = leaves(dict).map(([, value]) => value.toLowerCase());
      expect(texts.filter((text) => /captura r[áa]pida|quick capture/.test(text))).toEqual([]);
      expect(dict.nav.quickAdd).toBe(NEW_ENTRY[language as keyof typeof NEW_ENTRY]);
    },
  );

  it.each(Object.entries(languages))(
    'Dado %s, então a dica do "reservado" cabe no Tooltip (até 120 caracteres)',
    (_, dict) => {
      expect(dict.home.reservedNote.formula.length).toBeLessThanOrEqual(120);
    },
  );

  it('Dado as telas e os componentes, então as chaves são agrupadas por contexto', () => {
    const contexts = new Set(ptKeys.map((key) => key.split('.')[0]));
    expect([...contexts].sort()).toEqual([
      'accounts',
      'ai',
      'auth',
      'cards',
      'categories',
      'charts',
      'dashboard',
      'debts',
      'emptyState',
      'entryForm',
      'errors',
      'exports',
      'form',
      'goals',
      'header',
      'home',
      'imports',
      'lending',
      'more',
      'nav',
      'notFound',
      'notes',
      'notifications',
      'people',
      'projections',
      'quickAdd',
      'recurrences',
      'search',
      'settings',
      'shell',
      'summary',
      'transactions',
      'workspacePages',
    ]);
  });
});
