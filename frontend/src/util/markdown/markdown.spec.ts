import {
  decodeEntities,
  type MdBlock,
  type MdInline,
  MAX_INLINE_DEPTH,
  MAX_RENDER_CHARS,
  MAX_RENDER_NODES,
  parseMarkdown,
  parseMarkdownDocument,
  parseWikilink,
  stripFrontmatter,
} from '~/util/markdown/markdown';
import { wikilinkKey } from '~/util/markdown/wikilink-key';

/** Todos os nós inline da árvore, em qualquer profundidade. */
function allInlines(blocks: readonly MdBlock[]): MdInline[] {
  const out: MdInline[] = [];
  const walkInline = (nodes: readonly MdInline[]) => {
    for (const node of nodes) {
      out.push(node);
      if ('children' in node) walkInline(node.children);
    }
  };
  const walkBlock = (list: readonly MdBlock[]) => {
    for (const block of list) {
      if (block.kind === 'heading' || block.kind === 'paragraph') walkInline(block.children);
      else if (block.kind === 'quote') walkBlock(block.children);
      else if (block.kind === 'list') for (const item of block.items) walkBlock(item.children);
      else if (block.kind === 'table') {
        for (const cell of block.header) walkInline(cell);
        for (const row of block.rows) for (const cell of row) walkInline(cell);
      }
    }
  };
  walkBlock(blocks);
  return out;
}

/** Payloads clássicos de XSS (OWASP) e variações específicas de Markdown. */
const XSS_PAYLOADS: readonly string[] = [
  '<script>alert(1)</script>',
  '<SCRIPT SRC=http://evil/x.js></SCRIPT>',
  '<img src=x onerror=alert(1)>',
  '<img src="x" onerror="alert(document.cookie)">',
  '<svg onload=alert(1)>',
  '<svg><script>alert(1)</script></svg>',
  '<iframe src="javascript:alert(1)"></iframe>',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  '<body onload=alert(1)>',
  '<a href="javascript:alert(1)">clique</a>',
  '<a href=" javascript:alert(1)">clique</a>',
  '<details open ontoggle=alert(1)>',
  '<input autofocus onfocus=alert(1)>',
  '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
  '<object data="javascript:alert(1)"></object>',
  '<embed src="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">',
  '<style>@import "http://evil/x.css";</style>',
  '<link rel=stylesheet href=http://evil/x.css>',
  '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
  '<form action="javascript:alert(1)"><button>ok</button></form>',
  '[clique](javascript:alert(1))',
  '[clique](JaVaScRiPt:alert(1))',
  '[clique]( javascript:alert(1))',
  '[clique](java\tscript:alert(1))',
  '[clique](data:text/html,<script>alert(1)</script>)',
  '[clique](vbscript:msgbox(1))',
  '[clique](file:///etc/passwd)',
  '[clique](//evil.com)',
  '[clique][ref]\n\n[ref]: javascript:alert(1)',
  '<javascript:alert(1)>',
  '![x](javascript:alert(1))',
  '![x](http://evil.com/rastreio.png)',
  '![x](data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+)',
  '![x"onerror="alert(1)](http://x/y.png)',
  '[x](http://exemplo.com "t\\" onmouseover=\\"alert(1)")',
  '[x](<http://a.com/" onclick="alert(1)>)',
  '`<script>alert(1)</script>`',
  '```html\n<script>alert(1)</script>\n```',
  '&lt;script&gt;alert(1)&lt;/script&gt;',
  '&#60;script&#62;alert(1)&#60;/script&#62;',
  '<scr<script>ipt>alert(1)</scr</script>ipt>',
  '<img src=x onerror=alert(1)//',
  '[[<img src=x onerror=alert(1)>]]',
  '[[x|<script>alert(1)</script>]]',
  '# <img src=x onerror=alert(1)>',
  '> <svg/onload=alert(1)>',
  '- <a href="javascript:alert(1)">x</a>',
  '| <img src=x onerror=alert(1)> |\n|---|\n| <script>alert(1)</script> |',
  '<div style="background:url(javascript:alert(1))">x</div>',
  '<video><source onerror=alert(1)></video>',
  '<base href="javascript:alert(1)//">',
  'foo<script>alert(1)</script>bar',
];

describe('parseMarkdown', () => {
  it('Dado texto comum, então devolve a árvore de blocos', () => {
    const blocks = parseMarkdown(
      '# Título\n\nUm **forte**, *ênfase* e `código`.\n\n- a\n- b\n\n> citação',
    );
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph', 'list', 'quote']);
    const inlines = allInlines(blocks).map((n) => n.kind);
    expect(inlines).toEqual(expect.arrayContaining(['strong', 'em', 'code']));
  });

  it('Dado frontmatter, então ele não aparece no corpo', () => {
    const blocks = parseMarkdown('---\ntitle: Segredo\ntags: [a]\n---\n# Olá');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.kind).toBe('heading');
  });

  it('Dado tarefas, então o marcador vira checkbox e o texto não o repete', () => {
    const [list] = parseMarkdown('- [x] feita\n- [ ] aberta');
    expect(list?.kind).toBe('list');
    if (list?.kind !== 'list') return;
    expect(list.items.map((i) => [i.task, i.checked])).toEqual([
      [true, true],
      [true, false],
    ]);
  });

  it('Dado uma tabela, então devolve cabeçalho, linhas e alinhamento', () => {
    const [table] = parseMarkdown('| a | b |\n|:--|--:|\n| 1 | 2 |');
    expect(table?.kind).toBe('table');
    if (table?.kind !== 'table') return;
    expect(table.align).toEqual(['left', 'right']);
    expect(table.rows).toHaveLength(1);
  });

  it('Dado link http(s), então é externo; dado mailto, interno ao app mas seguro', () => {
    const nodes = allInlines(parseMarkdown('[a](https://exemplo.com) [b](mailto:x@y.com)'));
    const links = nodes.filter((n) => n.kind === 'link');
    expect(links).toEqual([
      expect.objectContaining({ href: 'https://exemplo.com/', external: true }),
      expect.objectContaining({ href: 'mailto:x@y.com', external: false }),
    ]);
  });

  it('Dado imagem remota, então nunca vira imagem carregada: só o texto alternativo', () => {
    const nodes = allInlines(parseMarkdown('![Foto do gato](https://exemplo.com/gato.png)'));
    expect(nodes).toEqual([
      { kind: 'image', alt: 'Foto do gato', source: 'https://exemplo.com/gato.png' },
    ]);
  });

  describe('wikilinks', () => {
    it.each([
      ['[[MacBook]]', { target: 'MacBook', alias: null, section: null, label: 'MacBook' }],
      [
        '[[reviews/2026-10]]',
        { target: 'reviews/2026-10', alias: null, section: null, label: 'reviews/2026-10' },
      ],
      [
        '[[MacBook|meu notebook]]',
        { target: 'MacBook', alias: 'meu notebook', section: null, label: 'meu notebook' },
      ],
      ['[[MacBook#preço]]', { target: 'MacBook', alias: null, section: 'preço', label: 'MacBook' }],
      [
        '[[MacBook#preço|caro]]',
        { target: 'MacBook', alias: 'caro', section: 'preço', label: 'caro' },
      ],
    ])('Dado %s, então vira um wikilink', (source, expected) => {
      const [node] = allInlines(parseMarkdown(source));
      expect(node).toEqual(
        expect.objectContaining({ kind: 'wikilink', embed: false, ...expected }),
      );
    });

    it('Dado ![[arquivo]], então é um embed (mostrado como link, nada é incorporado)', () => {
      const [node] = allInlines(parseMarkdown('![[foto.png]]'));
      expect(node).toEqual(
        expect.objectContaining({ kind: 'wikilink', embed: true, target: 'foto.png' }),
      );
    });

    it('Dado wikilink sem alvo ([[#seção]] ou [[]]), então segue como texto', () => {
      const nodes = allInlines(parseMarkdown('[[#seção]] e [[]]'));
      expect(nodes.some((n) => n.kind === 'wikilink')).toBe(false);
    });

    it('Dado wikilink em código, então não é link', () => {
      const nodes = allInlines(parseMarkdown('`[[MacBook]]`'));
      expect(nodes.some((n) => n.kind === 'wikilink')).toBe(false);
      const blocks = parseMarkdown('```\n[[MacBook]]\n```');
      expect(blocks[0]?.kind).toBe('code');
    });

    it('Dado parseWikilink, então separa alvo, seção e alias', () => {
      expect(parseWikilink('a#b|c')).toEqual({ target: 'a', section: 'b', alias: 'c' });
      expect(parseWikilink('  ')).toBeNull();
    });

    it('Dado wikilinkKey, então ignora caixa, acento, .md e espaços', () => {
      expect(wikilinkKey('  Revisão   de Outubro.md ')).toBe('revisao de outubro');
      expect(wikilinkKey('Projetos/MG Tech')).toBe('projetos/mg tech');
    });
  });

  describe('XSS: nenhum payload produz nó executável', () => {
    it('Dado a lista de payloads, então tem pelo menos 30', () => {
      expect(XSS_PAYLOADS.length).toBeGreaterThanOrEqual(30);
    });

    it.each(XSS_PAYLOADS.map((payload) => [payload]))(
      'Dado %j, então só há texto e links http(s)/mailto',
      (payload) => {
        const blocks = parseMarkdown(payload);
        const nodes = allInlines(blocks);
        // 1) Todo link vivo tem esquema permitido e nenhum atributo extra.
        for (const node of nodes) {
          if (node.kind === 'link') {
            expect(node.href).toMatch(/^(https?:\/\/|mailto:)/i);
            expect(node.href.toLowerCase()).not.toContain('javascript:');
          }
        }
        // 2) A árvore só tem tipos de dados conhecidos (nunca "html"): HTML bruto é texto.
        const kinds = new Set([...nodes.map((n) => n.kind), ...blocks.map((b) => b.kind)]);
        for (const kind of kinds) {
          expect([
            'text',
            'strong',
            'em',
            'del',
            'code',
            'br',
            'link',
            'image',
            'wikilink',
            'checkbox',
            'heading',
            'paragraph',
            'quote',
            'list',
            'hr',
            'table',
          ]).toContain(kind);
        }
        // 3) Imagens são sempre bloqueadas (a árvore não tem como carregar).
        for (const node of nodes) {
          if (node.kind === 'image')
            expect(Object.keys(node).sort()).toEqual(['alt', 'kind', 'source']);
        }
      },
    );

    it('Dado HTML bruto, então o texto literal fica visível (o usuário vê o que escreveu)', () => {
      const [block] = parseMarkdown('<script>alert(1)</script>');
      expect(block).toEqual({
        kind: 'paragraph',
        children: [{ kind: 'text', text: '<script>alert(1)</script>' }],
      });
    });

    it('Dado href javascript: num link, então o texto fica sem link', () => {
      const nodes = allInlines(parseMarkdown('[clique](javascript:alert(1))'));
      expect(nodes).toEqual([{ kind: 'text', text: 'clique' }]);
    });
  });

  describe('entradas patológicas', () => {
    it('Dado texto vazio ou só frontmatter, então não há blocos', () => {
      expect(parseMarkdown('')).toEqual([]);
      expect(parseMarkdown('---\na: 1\n---\n')).toEqual([]);
    });

    it('Dado aninhamento profundo, então corta no limite e não estoura a pilha', () => {
      const blocks = parseMarkdown(`${'> '.repeat(500)}fundo`);
      expect(blocks.length).toBeGreaterThan(0);
      const depth = (list: readonly MdBlock[]): number =>
        list.reduce((max, b) => Math.max(max, b.kind === 'quote' ? 1 + depth(b.children) : 0), 0);
      expect(depth(blocks)).toBeLessThanOrEqual(8);
    });

    it('Dado texto acima do limite de renderização, então mostra só o começo, como código, e avisa o corte', () => {
      const doc = parseMarkdownDocument('x'.repeat(MAX_RENDER_CHARS + 1));
      expect(doc.truncated).toBe(true);
      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0]).toMatchObject({ kind: 'code' });
      expect((doc.blocks[0] as { text: string }).text).toHaveLength(MAX_RENDER_CHARS);
    });

    it('Dado nota com mais nós que o orçamento, então corta e avisa; abaixo dele, não corta', () => {
      const unit = 'palavra *ênfase* **forte** [[nota]] `código` ';
      const heavy = parseMarkdownDocument(unit.repeat(4500));
      expect(heavy.truncated).toBe(true);
      const count = (b: readonly MdBlock[]) => allInlines(b).length;
      expect(count(heavy.blocks)).toBeLessThanOrEqual(MAX_RENDER_NODES + 20);
      expect(parseMarkdownDocument(unit.repeat(100)).truncated).toBe(false);
    });

    it('Dado nota de 200 KB, então processa sem falhar', () => {
      const text = '# t\n\n' + 'palavra *ênfase* [[nota]] '.repeat(7000);
      expect(text.length).toBeGreaterThan(150_000);
      expect(parseMarkdown(text).length).toBeGreaterThan(0);
    });

    it('Dado a entrada acima do teto, então o teto é o limite de nota do backend (200 KB)', () => {
      expect(MAX_RENDER_CHARS).toBe(200_000);
    });

    it('Dado ênfase aninhada 1.000 níveis (~~a ~~a ...), então corta a profundidade inline e não lança (F2)', () => {
      const text = `${'~~a '.repeat(1000)}x${' a~~'.repeat(1000)}`;

      const doc = parseMarkdownDocument(text);

      const depth = (nodes: readonly MdInline[]): number =>
        nodes.reduce((max, n) => Math.max(max, 'children' in n ? 1 + depth(n.children) : 0), 0);
      const paragraphs = doc.blocks.filter((b) => b.kind === 'paragraph');
      expect(paragraphs.length).toBeGreaterThan(0);
      for (const block of paragraphs) {
        expect(depth((block as { children: readonly MdInline[] }).children)).toBeLessThanOrEqual(
          MAX_INLINE_DEPTH,
        );
      }
      expect(doc.blocks[0]?.kind).not.toBe('code');
    });

    it('Dado **a *a ... aninhado fundo, então a profundidade inline também é limitada (F2)', () => {
      const doc = parseMarkdownDocument(`${'**a *a '.repeat(400)}x`);
      const depth = (nodes: readonly MdInline[]): number =>
        nodes.reduce((max, n) => Math.max(max, 'children' in n ? 1 + depth(n.children) : 0), 0);
      for (const block of doc.blocks) {
        if (block.kind === 'paragraph')
          expect(depth(block.children)).toBeLessThanOrEqual(MAX_INLINE_DEPTH);
      }
    });

    it('Dado lista de 50 mil itens, então o orçamento corta, marca truncated e não cria os itens todos (F3)', () => {
      const doc = parseMarkdownDocument('- a\n'.repeat(50_000));

      const list = doc.blocks[0];
      expect(doc.truncated).toBe(true);
      expect(list?.kind).toBe('list');
      expect((list as Extract<MdBlock, { kind: 'list' }>).items.length).toBeLessThanOrEqual(
        MAX_RENDER_NODES,
      );
    });

    it('Dado lista numerada de 40 mil itens, então também é cortada (F3)', () => {
      const doc = parseMarkdownDocument('1. a\n'.repeat(40_000));
      expect(doc.truncated).toBe(true);
      expect(
        (doc.blocks[0] as Extract<MdBlock, { kind: 'list' }>).items.length,
      ).toBeLessThanOrEqual(MAX_RENDER_NODES);
    });

    it('Dado tabela de 30 mil linhas, então corta linhas e células pelo orçamento (F3)', () => {
      const doc = parseMarkdownDocument(`| a |\n|---|\n${'| x |\n'.repeat(30_000)}`);

      const table = doc.blocks[0] as Extract<MdBlock, { kind: 'table' }>;
      expect(doc.truncated).toBe(true);
      expect(table.kind).toBe('table');
      const cells = table.header.length + table.rows.reduce((sum, row) => sum + 1 + row.length, 0);
      expect(cells).toBeLessThanOrEqual(MAX_RENDER_NODES * 2);
      expect(table.rows.length).toBeLessThanOrEqual(MAX_RENDER_NODES);
    });

    it('Dado tabela larga (muitas colunas), então as células também são debitadas (F3)', () => {
      const cols = 15_000;
      const row = `|${' x |'.repeat(cols)}`;
      const doc = parseMarkdownDocument(`${row}\n|${'---|'.repeat(cols)}\n${row}\n`);

      const table = doc.blocks[0] as Extract<MdBlock, { kind: 'table' }>;
      expect(table.header.length).toBeLessThanOrEqual(MAX_RENDER_NODES);
      expect(doc.truncated).toBe(true);
    });
  });

  describe('fidelidade (F9)', () => {
    it('Dado código inline com entidade, então mostra o literal (CommonMark)', () => {
      const [block] = parseMarkdown('`&lt;b&gt;`');
      expect(block).toMatchObject({
        kind: 'paragraph',
        children: [{ kind: 'code', text: '&lt;b&gt;' }],
      });
    });

    it('Dado [^1] e a definição, então a referência vira nó e a definição vira bloco de rodapé', () => {
      const blocks = parseMarkdown('Texto[^1] fim.\n\n[^1]: A fonte.');

      expect(allInlines(blocks)).toContainEqual({ kind: 'footnote', label: '1' });
      expect(blocks.find((b) => b.kind === 'footnote')).toMatchObject({
        kind: 'footnote',
        label: '1',
        children: [{ kind: 'text', text: 'A fonte.' }],
      });
    });

    it('Dado RLO/zero-width no texto, no código e no alt, então aparecem como marcas visíveis (F7)', () => {
      const rlo = '\u{202e}';
      const blocks = parseMarkdown(
        `texto${rlo}fdp.exe e ` + '`cod' + rlo + '`' + `\n\n` + '```\nx' + rlo + '\n```',
      );

      const flat = JSON.stringify(blocks);
      expect(flat).not.toContain(rlo);
      expect(flat).toContain('‹U+202E›');
    });

    it('Dado [banco.com](https://evil.com), então o destino real aparece ao lado do link (F7)', () => {
      const link = allInlines(parseMarkdown('[banco.com](https://evil.com/x)')).find(
        (n) => n.kind === 'link',
      );
      expect(link).toMatchObject({ kind: 'link', host: 'evil.com', external: true });
    });

    it('Dado link cujo texto já mostra o destino, então não repete o host', () => {
      const link = allInlines(parseMarkdown('[exemplo.com](https://www.exemplo.com/a)')).find(
        (n) => n.kind === 'link',
      );
      expect(link).toMatchObject({ host: null });
    });

    it('Dado host com acento (IDN), então mostra o punycode (anti-homógrafo)', () => {
      const link = allInlines(parseMarkdown('[meu banco](https://bаnco.com)')).find(
        (n) => n.kind === 'link',
      );
      expect((link as { host: string }).host).toMatch(/^xn--/);
    });

    it('Dado front matter que não é YAML, então o texto fica; YAML de verdade continua oculto', () => {
      expect(stripFrontmatter('---\nAviso importante\n---\ncorpo')).toBe(
        '---\nAviso importante\n---\ncorpo',
      );
      expect(stripFrontmatter('---\ntitle: Nota\ntags:\n  - a\n  - b\n# c\n---\ncorpo')).toBe(
        'corpo',
      );
      expect(stripFrontmatter('---\n---\ncorpo')).toBe('---\n---\ncorpo');
    });
  });

  describe('auxiliares', () => {
    it('Dado entidades, então decodifica só caracteres seguros', () => {
      expect(decodeEntities('a &amp; b &lt;x&gt; &#39;q&#39; &#x41; &foo; &#0;')).toBe(
        "a & b <x> 'q' A &foo; &#0;",
      );
    });

    it('Dado frontmatter com BOM e CRLF, então o remove', () => {
      expect(stripFrontmatter('﻿---\r\na: 1\r\n---\r\ncorpo')).toBe('corpo');
      expect(stripFrontmatter('sem\n---\nnada')).toBe('sem\n---\nnada');
    });
  });
});
