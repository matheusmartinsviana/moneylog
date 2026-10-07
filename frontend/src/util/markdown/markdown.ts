import { Marked, type Token, type Tokens } from 'marked';

import { displayText } from '~/util/display-text';
import { safeLink } from '~/util/markdown/safe-url';

/**
 * Markdown seguro (S-159, ADR-009): o backend nunca renderiza; o front transforma o texto numa **árvore de
 * dados** (`MdBlock`/`MdInline`) e a tela a desenha com templates do Angular. **Nenhuma string HTML é gerada
 * nem injetada** (nada de `innerHTML`, `DOMParser`, `bypassSecurityTrust*`): HTML bruto (`<script>`, `<img
 * onerror>`, `<svg>`, `<iframe>`...) vira **texto literal**; links só `http(s)`/`mailto`; imagens nunca são
 * carregadas (anti-rastreio) e mostram o texto alternativo. Por construção não existe nó executável a
 * sanitizar (a sanitização estrita é estrutural, mais forte que filtrar uma string HTML).
 */

export type MdInline =
  | { readonly kind: 'text'; readonly text: string }
  | {
      readonly kind: 'strong' | 'em' | 'del';
      readonly children: readonly MdInline[];
    }
  | { readonly kind: 'code'; readonly text: string }
  | { readonly kind: 'br' }
  | {
      readonly kind: 'link';
      readonly href: string;
      readonly external: boolean;
      /**
       * Destino real (host, em punycode se for IDN) quando o texto do link **não** o mostra: `[banco.com](https://evil.com)`
       * exibe `evil.com` ao lado, para o texto não enganar sobre o destino (F7).
       */
      readonly host: string | null;
      readonly children: readonly MdInline[];
    }
  /** Imagem **sempre bloqueada**: só o texto alternativo (e o endereço como texto, sem carregar). */
  | { readonly kind: 'image'; readonly alt: string; readonly source: string }
  | {
      readonly kind: 'wikilink';
      /** Alvo como escrito (`projetos/MG Tech`), sem alias nem seção. */
      readonly target: string;
      readonly alias: string | null;
      readonly section: string | null;
      readonly embed: boolean;
      /** Texto visível: o alias, senão o alvo. */
      readonly label: string;
    }
  | { readonly kind: 'checkbox'; readonly checked: boolean }
  /** Referência de nota de rodapé (`[^1]`). */
  | { readonly kind: 'footnote'; readonly label: string };

export interface MdListItem {
  readonly task: boolean;
  readonly checked: boolean;
  readonly children: readonly MdBlock[];
}

export type MdAlign = 'left' | 'center' | 'right' | null;

export type MdBlock =
  | {
      readonly kind: 'heading';
      readonly depth: 1 | 2 | 3 | 4 | 5 | 6;
      readonly children: readonly MdInline[];
    }
  | { readonly kind: 'paragraph'; readonly children: readonly MdInline[] }
  | { readonly kind: 'code'; readonly lang: string | null; readonly text: string }
  | { readonly kind: 'quote'; readonly children: readonly MdBlock[] }
  | {
      readonly kind: 'list';
      readonly ordered: boolean;
      readonly start: number | null;
      readonly items: readonly MdListItem[];
    }
  | { readonly kind: 'hr' }
  /** Definição de nota de rodapé (`[^1]: texto`). */
  | { readonly kind: 'footnote'; readonly label: string; readonly children: readonly MdInline[] }
  | {
      readonly kind: 'table';
      readonly align: readonly MdAlign[];
      readonly header: readonly (readonly MdInline[])[];
      readonly rows: readonly (readonly (readonly MdInline[])[])[];
    };

/**
 * Teto de entrada: o limite de nota do backend (200 KB). Acima disto o texto é mostrado como código. O teto
 * **não** protege do custo quadrático do lexer (isso é o Web Worker com tempo limite, `markdown-render.ts`).
 */
export const MAX_RENDER_CHARS = 200_000;
const MAX_DEPTH = 8;
/** Profundidade máxima de `strong`/`em`/`del`/`link` aninhados: abaixo disso vira texto (F2). */
export const MAX_INLINE_DEPTH = 8;
/**
 * Orçamento de nós (inline, blocos, itens de lista, linhas e células de tabela) desenhados: protege o aparelho de uma nota patológica (200 KB num
 * parágrafo só gera dezenas de milhares de nós). Passou, a pré-visualização mostra o começo e avisa
 * (`truncated`); o texto completo continua no editor.
 */
export const MAX_RENDER_NODES = 12_000;

interface Budget {
  remaining: number;
  truncated: boolean;
}

/** A árvore e se ela foi cortada pelo orçamento de nós. */
export interface MdDocument {
  readonly blocks: readonly MdBlock[];
  readonly truncated: boolean;
}

const WIKILINK_SOURCE = /^(!?)\[\[([^[\]\n]{1,300})\]\]/;

/** Separa `nome#seção|alias` (a ordem do Obsidian) e `nome|alias` / `nome#seção`. */
export function parseWikilink(
  inner: string,
): { target: string; alias: string | null; section: string | null } | null {
  const pipe = inner.indexOf('|');
  const head = pipe < 0 ? inner : inner.slice(0, pipe);
  const alias = pipe < 0 ? null : inner.slice(pipe + 1).trim();
  const hash = head.indexOf('#');
  const target = (hash < 0 ? head : head.slice(0, hash)).trim();
  const section = hash < 0 ? null : head.slice(hash + 1).trim();
  if (target === '') return null;
  return {
    target,
    alias: alias === '' ? null : alias,
    section: section === '' ? null : section,
  };
}

const marked = new Marked({
  gfm: true,
  breaks: false,
  extensions: [
    {
      name: 'wikilink',
      level: 'inline',
      start(source: string) {
        return /!?\[\[/.exec(source)?.index;
      },
      tokenizer(source: string) {
        const match = WIKILINK_SOURCE.exec(source);
        if (!match) return undefined;
        const parsed = parseWikilink(match[2] ?? '');
        if (!parsed) return undefined;
        return {
          type: 'wikilink',
          raw: match[0],
          embed: match[1] === '!',
          target: parsed.target,
          alias: parsed.alias,
          section: parsed.section,
        };
      },
    },
  ],
});

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
};

/**
 * Entidades de caractere (`&amp;`, `&#39;`) viram o caractere **como texto**. Nada daqui vira marcação:
 * o resultado só é interpolado como texto pelo template.
 */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,6});/gi, (whole, entity: string) => {
    if (entity.startsWith('#')) {
      const code =
        entity[1]?.toLowerCase() === 'x'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      // Nada de controle, surrogate solto ou fora do Unicode.
      if (
        !Number.isFinite(code) ||
        code < 32 ||
        code > 0x10ffff ||
        (code >= 0xd800 && code <= 0xdfff)
      ) {
        return whole;
      }
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? whole;
  });
}

/** Uma linha plausível de YAML simples: `chave: valor`, item de lista, continuação indentada ou comentário. */
const FRONTMATTER_LINE = /^(?:\s*|\s*#.*|[\w\-"'. ]{1,80}:(?:\s.*)?|\s+\S.*|-\s.*)$/;
const FRONTMATTER_KEY = /^[\w\-"'. ]{1,80}:(?:\s.*)?$/;
const MAX_FRONTMATTER_LINES = 200;

/**
 * Remove o frontmatter YAML do começo (`---` ... `---`): ele não é conteúdo para ler. **Só se parecer YAML**
 * (linhas `chave: valor`/lista/comentário, ao menos uma chave): `---\nAviso importante\n---\ncorpo` é conteúdo
 * do usuário e continua visível (F9).
 */
export function stripFrontmatter(source: string): string {
  const match = /^\ufeff?---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(source);
  if (!match) return source;
  const inner = match[0]
    .replace(/\r?\n$/, '')
    .split(/\r?\n/)
    .slice(1, -1);
  if (inner.length > MAX_FRONTMATTER_LINES) return source;
  if (!inner.every((line) => FRONTMATTER_LINE.test(line))) return source;
  if (!inner.some((line) => FRONTMATTER_KEY.test(line))) return source;
  return source.slice(match[0].length);
}

function textOf(nodes: readonly MdInline[]): string {
  return nodes
    .map((node) => {
      if (node.kind === 'text' || node.kind === 'code') return node.text;
      if ('children' in node) return textOf(node.children);
      if (node.kind === 'image') return node.alt;
      if (node.kind === 'wikilink') return node.label;
      return '';
    })
    .join('');
}

/** O host do destino, a menos que o próprio texto do link já o mostre. */
function hostToShow(href: string, children: readonly MdInline[]): string | null {
  let host: string;
  try {
    host = new URL(href).host;
  } catch {
    return null;
  }
  if (host === '') return null;
  const label = textOf(children).toLowerCase();
  return label.includes(host.toLowerCase().replace(/^www\./, '')) ? null : host;
}

/** Texto da nota: caracteres bidi/controle/zero-width aparecem como `‹U+XXXX›` (F7), nunca escondidos. */
function visible(text: string): string {
  return displayText(text, { multiline: true });
}

function plain(text: string): MdInline[] {
  return text === '' ? [] : [{ kind: 'text', text: visible(text) }];
}

const FOOTNOTE_REF = /\[\^([^\]\s[]{1,40})\]/g;

/** Texto com as referências `[^1]` viradas em nós de rodapé (o resto continua texto). */
function withFootnotes(text: string): MdInline[] {
  if (!text.includes('[^')) return plain(text);
  const out: MdInline[] = [];
  let last = 0;
  for (const match of text.matchAll(FOOTNOTE_REF)) {
    out.push(...plain(text.slice(last, match.index)));
    out.push({ kind: 'footnote', label: match[1] ?? '' });
    last = match.index + match[0].length;
  }
  out.push(...plain(text.slice(last)));
  return out;
}

/** `depth` aqui é a profundidade **inline** (strong/em/del/link aninhados), não a de blocos. */
function inlines(tokens: readonly Token[] | undefined, depth: number, budget: Budget): MdInline[] {
  if (!tokens) return [];
  if (depth >= MAX_INLINE_DEPTH) {
    // Fundo demais: o resto vira texto, sem recursar (o `~~a ` x 1000 estourava a pilha do Angular).
    return tokens.length === 0 ? [] : plain(tokens.map((token) => token.raw).join(''));
  }
  const out: MdInline[] = [];
  for (const token of tokens) {
    if (budget.remaining <= 0) {
      budget.truncated = true;
      break;
    }
    const nodes = inline(token, depth, budget);
    budget.remaining -= nodes.length;
    out.push(...nodes);
  }
  return out;
}

function inline(token: Token, depth: number, budget: Budget): MdInline[] {
  switch (token.type) {
    case 'text':
    case 'escape': {
      const t = token as Tokens.Text;
      return t.tokens && t.tokens.length > 0
        ? inlines(t.tokens, depth + 1, budget)
        : withFootnotes(decodeEntities(t.text));
    }
    case 'strong':
    case 'em':
    case 'del': {
      const t = token as Tokens.Strong;
      return [{ kind: token.type, children: inlines(t.tokens, depth + 1, budget) }];
    }
    case 'codespan':
      // Código inline é literal (CommonMark): `&lt;b&gt;` mostra `&lt;b&gt;`, sem decodificar entidades.
      return [{ kind: 'code', text: visible((token as Tokens.Codespan).text) }];
    case 'br':
      return [{ kind: 'br' }];
    case 'checkbox':
      return [{ kind: 'checkbox', checked: (token as Tokens.Checkbox).checked }];
    case 'link': {
      const t = token as Tokens.Link;
      const children = inlines(t.tokens, depth + 1, budget);
      const safe = safeLink(decodeEntities(t.href));
      // Esquema não permitido: o texto fica, sem link (nunca o `javascript:` como href).
      if (!safe) return children.length > 0 ? children : plain(decodeEntities(t.text));
      return [
        {
          kind: 'link',
          href: safe.href,
          external: safe.external,
          host: safe.external ? hostToShow(safe.href, children) : null,
          children,
        },
      ];
    }
    case 'image': {
      const t = token as Tokens.Image;
      return [
        {
          kind: 'image',
          alt: visible(decodeEntities(t.text)),
          source: visible(decodeEntities(t.href)),
        },
      ];
    }
    case 'wikilink': {
      const t = token as Tokens.Generic;
      const target = String(t['target']);
      const alias = (t['alias'] as string | null) ?? null;
      return [
        {
          kind: 'wikilink',
          target,
          alias,
          section: (t['section'] as string | null) ?? null,
          embed: t['embed'] === true,
          label: visible(alias ?? target),
        },
      ];
    }
    case 'html':
    case 'tag':
      // HTML bruto desabilitado (S-159): vira texto literal, nunca marcação.
      return plain((token as Tokens.HTML).text ?? token.raw);
    default:
      // Qualquer token desconhecido: o texto cru, como texto.
      return plain(token.raw);
  }
}

function blocks(tokens: readonly Token[], depth: number, budget: Budget): MdBlock[] {
  const out: MdBlock[] = [];
  for (const token of tokens) {
    if (budget.remaining <= 0) {
      budget.truncated = true;
      break;
    }
    const block = blockOf(token, depth, budget);
    if (block) {
      budget.remaining -= 1;
      out.push(block);
    }
  }
  return out;
}

function blockOf(token: Token, depth: number, budget: Budget): MdBlock | null {
  switch (token.type) {
    case 'space':
    case 'def':
      return null;
    case 'heading': {
      const t = token as Tokens.Heading;
      const level = Math.min(6, Math.max(1, t.depth)) as 1 | 2 | 3 | 4 | 5 | 6;
      return { kind: 'heading', depth: level, children: inlines(t.tokens, 0, budget) };
    }
    case 'paragraph':
    case 'text': {
      const t = token as Tokens.Paragraph;
      const footnote = /^\[\^([^\]\s[]{1,40})\]:[ \t]*/.exec(t.text);
      if (footnote) {
        // Definição de nota de rodapé: o conteúdo aparece (antes era descartado como `def`).
        const first = t.tokens?.[0];
        const rest =
          first?.type === 'text'
            ? [{ ...first, text: (first as Tokens.Text).text.slice(footnote[0].length) }]
            : [];
        const tail = (t.tokens ?? []).slice(1);
        return {
          kind: 'footnote',
          label: footnote[1] ?? '',
          children:
            first?.type === 'text'
              ? inlines([...rest, ...tail] as Token[], 0, budget)
              : plain(decodeEntities(t.text.slice(footnote[0].length))),
        };
      }
      return {
        kind: 'paragraph',
        children:
          t.tokens && t.tokens.length > 0
            ? inlines(t.tokens, 0, budget)
            : plain(decodeEntities(t.text)),
      };
    }
    case 'code': {
      const t = token as Tokens.Code;
      return {
        kind: 'code',
        lang: t.lang ? t.lang.trim().split(/\s+/)[0] || null : null,
        text: visible(t.text),
      };
    }
    case 'hr':
      return { kind: 'hr' };
    case 'blockquote': {
      const t = token as Tokens.Blockquote;
      if (depth >= MAX_DEPTH) return { kind: 'paragraph', children: plain(t.raw) };
      return { kind: 'quote', children: blocks(t.tokens, depth + 1, budget) };
    }
    case 'list': {
      const t = token as Tokens.List;
      if (depth >= MAX_DEPTH) return { kind: 'paragraph', children: plain(t.raw) };
      const items: MdListItem[] = [];
      for (const item of t.items) {
        // Cada item é debitado **antes** de ser criado (uma lista de 50 mil itens não escapa do orçamento).
        if (budget.remaining <= 0) {
          budget.truncated = true;
          break;
        }
        budget.remaining -= 1;
        items.push({
          task: item.task,
          checked: item.checked === true,
          // O marcador de tarefa vira o checkbox do item (sem repeti-lo no texto).
          children: blocks(
            item.tokens.filter((child) => child.type !== 'checkbox'),
            depth + 1,
            budget,
          ),
        });
      }
      return {
        kind: 'list',
        ordered: t.ordered,
        start: typeof t.start === 'number' ? t.start : null,
        items,
      };
    }
    case 'table': {
      const t = token as Tokens.Table;
      // Linha e célula são debitadas antes de criadas; ao zerar, para e marca o corte.
      const cells = (row: readonly Tokens.TableCell[]): MdInline[][] => {
        const out: MdInline[][] = [];
        for (const cell of row) {
          if (budget.remaining <= 0) {
            budget.truncated = true;
            break;
          }
          budget.remaining -= 1;
          out.push(inlines(cell.tokens, 0, budget));
        }
        return out;
      };
      const header = cells(t.header);
      const rows: MdInline[][][] = [];
      for (const row of t.rows) {
        if (budget.remaining <= 0) {
          budget.truncated = true;
          break;
        }
        budget.remaining -= 1;
        rows.push(cells(row));
      }
      return { kind: 'table', align: t.align, header, rows };
    }
    case 'html':
      // Bloco de HTML bruto: texto literal num parágrafo (o usuário vê o que escreveu).
      return { kind: 'paragraph', children: plain((token as Tokens.HTML).text.trim()) };
    default:
      return { kind: 'paragraph', children: plain(token.raw) };
  }
}

/** A nota como árvore de dados segura para desenhar, com o aviso de corte. Nunca lança. */
export function parseMarkdownDocument(source: string): MdDocument {
  const text = stripFrontmatter(source);
  if (text.trim() === '') return { blocks: [], truncated: false };
  if (text.length > MAX_RENDER_CHARS) {
    return {
      blocks: [{ kind: 'code', lang: null, text: text.slice(0, MAX_RENDER_CHARS) }],
      truncated: true,
    };
  }
  const budget: Budget = { remaining: MAX_RENDER_NODES, truncated: false };
  try {
    const result = blocks(marked.lexer(text), 0, budget);
    return { blocks: result, truncated: budget.truncated };
  } catch {
    // Entrada que o parser não aguenta: mostra como texto, nunca falha a tela.
    return { blocks: [{ kind: 'code', lang: null, text }], truncated: false };
  }
}

/** Só a árvore (sem o aviso de corte). */
export function parseMarkdown(source: string): readonly MdBlock[] {
  return parseMarkdownDocument(source).blocks;
}
