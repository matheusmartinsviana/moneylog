import { provideRouter } from '@angular/router';
import { render, screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { MarkdownViewComponent } from '~/app/features/notes/components/markdown-view/markdown-view.component';
import type { NoteLink } from '~/modules/notes/core/types/note';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';
import {
  type FakeMarkdownWorker,
  neverRespond,
  provideFakeMarkdownWorker,
  respondWithRealParser,
} from '~/testing/markdown-worker-testing';
import { aWikilink } from '~/testing/notes-testing';
import { MARKDOWN_PARSE_TIMEOUT_MS } from '~/util/markdown/markdown-render';

async function setup(source: string, links: readonly NoteLink[] = []) {
  const created: string[] = [];
  const result = await render(MarkdownViewComponent, {
    inputs: { source, links },
    on: { createNote: (target: string) => created.push(target) },
    providers: [provideI18nTesting('pt'), provideRouter([]), provideFakeMarkdownWorker()],
  });
  const root = result.container.querySelector('.md') as HTMLElement;
  // O parsing roda num executor assíncrono (sem Worker no jsdom: ramo em thread principal, só texto curto).
  await waitFor(() => expect(root).not.toHaveAttribute('aria-busy'));
  return { ...result, created, root };
}

/** O que nenhum Markdown pode produzir no DOM, qualquer que seja a entrada (S-159). */
const FORBIDDEN_TAGS = [
  'script',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'img',
  'picture',
  'video',
  'audio',
  'source',
  'link',
  'meta',
  'base',
  'style',
  'form',
  'input',
  'textarea',
  'select',
  'button[type="submit"]',
  'math',
  'details',
  'dialog',
  'canvas',
  'foreignobject',
];

function unsafeThings(root: HTMLElement): string[] {
  const found: string[] = [];
  for (const tag of FORBIDDEN_TAGS) {
    if (root.querySelector(tag)) found.push(`tag ${tag}`);
  }
  for (const el of Array.from(root.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.toLowerCase().replace(/\s+/g, '');
      if (name.startsWith('on')) found.push(`atributo ${name} em ${el.localName}`);
      if (
        ['href', 'src', 'srcdoc', 'action', 'formaction', 'xlink:href', 'data', 'poster'].includes(
          name,
        )
      ) {
        if (name !== 'href' || el.localName !== 'a')
          found.push(`atributo ${name} em ${el.localName}`);
        if (/^(javascript|data|vbscript|file|blob):/.test(value)) found.push(`${name}=${value}`);
      }
      if (name === 'style' && !['th', 'td'].includes(el.localName)) {
        found.push(`style em ${el.localName}`);
      }
    }
    if (el.localName === 'a') {
      const href = el.getAttribute('href') ?? '';
      if (href !== '' && !/^(https?:\/\/|mailto:)/i.test(href)) found.push(`a href=${href}`);
      if (href !== '' && !/noopener/.test(el.getAttribute('rel') ?? ''))
        found.push('a sem noopener');
      if (href !== '' && !/noreferrer/.test(el.getAttribute('rel') ?? ''))
        found.push('a sem noreferrer');
    }
  }
  return found;
}

const XSS_PAYLOADS: readonly string[] = [
  '<script>window.__pwned = 1</script>',
  '<SCRIPT SRC=http://evil/x.js></SCRIPT>',
  '<img src=x onerror=window.__pwned=1>',
  '<img src="x" onerror="window.__pwned=1">',
  '<svg onload=window.__pwned=1>',
  '<svg><script>window.__pwned=1</script></svg>',
  '<iframe src="javascript:window.__pwned=1"></iframe>',
  '<iframe srcdoc="<script>window.__pwned=1</script>"></iframe>',
  '<body onload=window.__pwned=1>',
  '<a href="javascript:window.__pwned=1">clique</a>',
  '<a href=" javascript:window.__pwned=1">clique</a>',
  '<details open ontoggle=window.__pwned=1>',
  '<input autofocus onfocus=window.__pwned=1>',
  '<math><mi xlink:href="javascript:window.__pwned=1">x</mi></math>',
  '<object data="javascript:window.__pwned=1"></object>',
  '<embed src="data:text/html;base64,PHNjcmlwdD53aW5kb3cuX19wd25lZD0xPC9zY3JpcHQ+">',
  '<style>@import "http://evil/x.css";</style>',
  '<link rel=stylesheet href=http://evil/x.css>',
  '<meta http-equiv="refresh" content="0;url=javascript:window.__pwned=1">',
  '<form action="javascript:window.__pwned=1"><button>ok</button></form>',
  '[clique](javascript:window.__pwned=1)',
  '[clique](JaVaScRiPt:window.__pwned=1)',
  '[clique](java\tscript:window.__pwned=1)',
  '[clique](data:text/html,<script>window.__pwned=1</script>)',
  '[clique](vbscript:msgbox(1))',
  '[clique](//evil.com)',
  '[clique][ref]\n\n[ref]: javascript:window.__pwned=1',
  '![x](javascript:window.__pwned=1)',
  '![x](http://evil.com/rastreio.png)',
  '![x](data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9d2luZG93Ll9fcHduZWQ9MT4=)',
  '![x"onerror="window.__pwned=1](http://x/y.png)',
  '`<script>window.__pwned=1</script>`',
  '```html\n<script>window.__pwned=1</script>\n```',
  '&lt;script&gt;window.__pwned=1&lt;/script&gt;',
  '<scr<script>ipt>window.__pwned=1</scr</script>ipt>',
  '[[<img src=x onerror=window.__pwned=1>]]',
  '[[x|<script>window.__pwned=1</script>]]',
  '# <img src=x onerror=window.__pwned=1>',
  '> <svg/onload=window.__pwned=1>',
  '- <a href="javascript:window.__pwned=1">x</a>',
  '| <img src=x onerror=window.__pwned=1> |\n|---|\n| <script>window.__pwned=1</script> |',
  '<div style="background:url(javascript:window.__pwned=1)">x</div>',
  '<video><source onerror=window.__pwned=1></video>',
  '<base href="javascript:window.__pwned=1//">',
  '<a href="https://ok.com" onclick="window.__pwned=1">x</a>',
  '[x](https://ok.com "t\\" onmouseover=\\"window.__pwned=1")',
  '---\ntitle: <script>window.__pwned=1</script>\n---\n# ok',
];

describe('MarkdownViewComponent', () => {
  describe('renderização', () => {
    it('Dado Markdown comum, então desenha títulos (sem um segundo h1), parágrafos, ênfase, listas, citação e código', async () => {
      const { root } = await setup(
        '# Título\n\n## Sub\n\nUm **forte**, *ênfase*, ~~riscado~~ e `código`.\n\n- a\n- b\n\n1. um\n2. dois\n\n> citação\n\n```\nbloco\n```\n\n---',
      );

      expect(root.querySelector('h1')).toBeNull();
      expect(root.querySelector('h2')).toHaveTextContent('Título');
      expect(root.querySelector('h3')).toHaveTextContent('Sub');
      expect(root.querySelector('strong')).toHaveTextContent('forte');
      expect(root.querySelector('em')).toHaveTextContent('ênfase');
      expect(root.querySelector('del')).toHaveTextContent('riscado');
      expect(root.querySelector('p code')).toHaveTextContent('código');
      expect(root.querySelectorAll('ul li')).toHaveLength(2);
      expect(root.querySelectorAll('ol li')).toHaveLength(2);
      expect(root.querySelector('blockquote')).toHaveTextContent('citação');
      expect(root.querySelector('pre code')).toHaveTextContent('bloco');
      expect(root.querySelector('hr')).not.toBeNull();
    });

    it('Dado tarefas e tabela, então desenha o marcador com nome acessível e a tabela com cabeçalho', async () => {
      const { root } = await setup('- [x] feita\n- [ ] aberta\n\n| a | b |\n|:--|--:|\n| 1 | 2 |');

      const checks = root.querySelectorAll('.md__check');
      expect(checks[0]).toHaveAttribute('aria-label', 'Tarefa concluída');
      expect(checks[1]).toHaveAttribute('aria-label', 'Tarefa em aberto');
      expect(root.querySelectorAll('th[scope="col"]')).toHaveLength(2);
      expect(root.querySelector('td')).toHaveTextContent('1');
    });

    it('Dado frontmatter, então ele não aparece', async () => {
      const { root } = await setup('---\ntitle: Segredo\ntags: [a]\n---\nCorpo');

      expect(root).not.toHaveTextContent('Segredo');
      expect(root).toHaveTextContent('Corpo');
    });

    it('Dado texto vazio, então mostra "Nada para mostrar ainda"', async () => {
      await setup('   ');

      expect(screen.getByTestId('markdown-empty')).toBeInTheDocument();
    });

    it('Dado entidades de caractere, então aparecem como o caractere, nunca como marcação', async () => {
      const { root } = await setup('Tom &amp; Jerry &lt;b&gt;x&lt;/b&gt;');

      expect(root).toHaveTextContent('Tom & Jerry <b>x</b>');
      expect(root.querySelector('b')).toBeNull();
    });
  });

  describe('links e imagens', () => {
    it('Dado link externo, então abre em outra aba com rel noopener noreferrer e avisa o leitor de tela', async () => {
      const { root } = await setup('[moneylog](https://exemplo.com/a)');

      const link = root.querySelector('a') as HTMLAnchorElement;
      expect(link).toHaveAttribute('href', 'https://exemplo.com/a');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
      expect(link).toHaveTextContent(/abre em outra aba/i);
    });

    it('Dado mailto, então é link seguro sem target', async () => {
      const { root } = await setup('[e-mail](mailto:oi@exemplo.com)');

      const link = root.querySelector('a') as HTMLAnchorElement;
      expect(link).toHaveAttribute('href', 'mailto:oi@exemplo.com');
      expect(link).not.toHaveAttribute('target');
      expect(link.getAttribute('rel')).toContain('noopener');
    });

    it('Dado link javascript: ou data:, então vira só o texto, sem link', async () => {
      const { root } = await setup('[a](javascript:alert(1)) e [b](data:text/html,x)');

      expect(root.querySelector('a')).toBeNull();
      expect(root).toHaveTextContent('a e b');
    });

    it('Dado imagem remota, então nunca carrega: mostra o texto alternativo', async () => {
      const { root } = await setup('![Foto do gato](https://exemplo.com/gato.png)');

      expect(root.querySelector('img')).toBeNull();
      expect(screen.getByTestId('md-image-blocked')).toHaveTextContent(
        'Imagem não carregada: Foto do gato',
      );
    });

    it('Dado imagem sem alt, então mostra o texto genérico', async () => {
      await setup('![](https://exemplo.com/gato.png)');

      expect(screen.getByTestId('md-image-blocked')).toHaveTextContent('Imagem não carregada');
    });
  });

  describe('wikilinks (resolvidos pelo backend)', () => {
    it('Dado [[MacBook]] resolvido, então é link de navegação para a nota do backend', async () => {
      await setup('Comprei o [[MacBook]].', [aWikilink()]);

      expect(screen.getByTestId('md-wikilink')).toHaveAttribute('href', '/notes/note-2');
      expect(screen.getByTestId('md-wikilink')).toHaveTextContent('MacBook');
    });

    it('Dado alias, então mostra o alias e leva ao alvo; seção é ignorada na navegação', async () => {
      await setup('[[MacBook#preço|meu notebook]]', [
        aWikilink({ alias: 'meu notebook', section: 'preço' }),
      ]);

      expect(screen.getByTestId('md-wikilink')).toHaveTextContent('meu notebook');
      expect(screen.getByTestId('md-wikilink')).toHaveAttribute('href', '/notes/note-2');
    });

    it('Dado a resolução sem diferenciar caixa nem acento, então casa o texto do backend', async () => {
      await setup('[[macbook]] e [[Revisão]]', [
        aWikilink({ text: 'MacBook' }),
        aWikilink({
          text: 'revisao',
          target: { id: 'n9', key: null, label: 'r', status: 'ACTIVE' },
        }),
      ]);

      const links = screen.getAllByTestId('md-wikilink');
      expect(links.map((l) => l.getAttribute('href'))).toEqual(['/notes/note-2', '/notes/n9']);
    });

    it('Dado link sem nota, então aparece "pendente" e não inventa o alvo; clicar pede para criar a nota', async () => {
      const { created } = await setup('Veja [[Nota nova]]', [
        aWikilink({ text: 'Nota nova', state: 'PENDING', target: null }),
      ]);

      const pending = screen.getByTestId('md-wikilink-pending');
      expect(pending).toHaveTextContent('Nota nova');
      expect(pending).toHaveTextContent('Pendente');
      expect(pending).not.toHaveAttribute('href');
      await userEvent.click(pending);

      expect(created).toEqual(['Nota nova']);
    });

    it('Dado wikilink que o backend ainda não conhece (texto novo, não salvo), então fica pendente', async () => {
      await setup('[[Recém digitado]]', []);

      expect(screen.getByTestId('md-wikilink-pending')).toBeInTheDocument();
    });

    it('Dado embed ![[arquivo]], então mostra o link e avisa que a incorporação não é exibida', async () => {
      await setup('![[MacBook]]', [aWikilink({ embed: true })]);

      expect(screen.getByTestId('md-embed')).toHaveTextContent('Incorporação não exibida');
    });

    it('Dado vínculo explícito de transação, então não resolve wikilink por engano', async () => {
      await setup('[[Notebook]]', [
        {
          origin: 'EXPLICIT',
          type: 'TRANSACTION',
          state: 'RESOLVED',
          text: 'Notebook',
          alias: null,
          section: null,
          embed: false,
          target: { id: 'tx-1', key: null, label: 'Notebook', status: 'ACTIVE' },
        },
      ]);

      expect(screen.getByTestId('md-wikilink-pending')).toBeInTheDocument();
    });
  });

  describe('XSS: Markdown malicioso não produz nenhum nó executável', () => {
    it('Dado a suíte, então tem pelo menos 30 payloads', () => {
      expect(XSS_PAYLOADS.length).toBeGreaterThanOrEqual(30);
    });

    it.each(XSS_PAYLOADS.map((payload) => [payload]))(
      'Dado %j, então o DOM não tem tag, atributo nem URL perigosos',
      async (payload) => {
        const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
        (window as unknown as { __pwned?: number }).__pwned = undefined;

        const { root } = await setup(payload);

        expect(unsafeThings(root)).toEqual([]);
        expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
        expect(alert).not.toHaveBeenCalled();
        alert.mockRestore();
      },
    );

    it('Dado HTML bruto, então o usuário vê o texto literal que escreveu', async () => {
      const { root } = await setup('<script>alert(1)</script>');

      expect(root).toHaveTextContent('<script>alert(1)</script>');
      expect(root.querySelector('script')).toBeNull();
    });

    it('Dado nota grande (5 KB de Markdown), então renderiza sem travar', async () => {
      const text = 'palavra *ênfase* **forte** [[nota]] `código` '.repeat(110);
      expect(text.length).toBeGreaterThan(4_800);

      const { root } = await setup(text);

      expect(root.querySelector('p')).not.toBeNull();
      expect(screen.queryByTestId('markdown-truncated')).not.toBeInTheDocument();
    }, 60_000);

    it('Dado texto acima do limite de renderização, então mostra o começo e avisa que foi cortado', async () => {
      await setup('x'.repeat(200_001));

      expect(screen.getByTestId('markdown-truncated')).toBeInTheDocument();
    });
  });

  describe('executor com tempo limite (F1)', () => {
    it('Dado um parser que nunca responde, então após o tempo limite mostra a nota como texto simples com o aviso', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        const created: FakeMarkdownWorker[] = [];
        const source = '*a '.repeat(50);
        const result = await render(MarkdownViewComponent, {
          inputs: { source, links: [] },
          providers: [
            provideI18nTesting('pt'),
            provideRouter([]),
            provideFakeMarkdownWorker(neverRespond, created),
          ],
        });

        await vi.advanceTimersByTimeAsync(MARKDOWN_PARSE_TIMEOUT_MS + 100);
        result.detectChanges();

        expect(await screen.findByTestId('markdown-too-complex')).toHaveTextContent(
          'Esta nota é grande ou complexa demais para formatar; mostrando como texto.',
        );
        expect(screen.getByTestId('markdown-plain')).toHaveTextContent(source.trim());
        expect(created[0]?.terminated).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it('Dado a tela destruída, então o worker é encerrado', async () => {
      const created: FakeMarkdownWorker[] = [];
      const result = await render(MarkdownViewComponent, {
        inputs: { source: '# oi', links: [] },
        providers: [
          provideI18nTesting('pt'),
          provideRouter([]),
          provideFakeMarkdownWorker(respondWithRealParser, created),
        ],
      });
      await waitFor(() => expect(created.length).toBe(1));

      result.fixture.destroy();

      expect(created[0]?.terminated).toBe(true);
    });
  });

  describe('notas de rodapé e front matter (F9)', () => {
    it('Dado [^1] e a definição, então a referência e o texto do rodapé aparecem', async () => {
      const { root } = await setup('Texto[^1] aqui.\n\n[^1]: A fonte do dado.');

      expect(root.querySelector('[data-cy="md-footnote-ref"]')).toHaveTextContent('1');
      expect(screen.getByTestId('md-footnote')).toHaveTextContent('A fonte do dado.');
    });

    it('Dado um aviso entre --- que não é YAML, então o texto continua visível', async () => {
      const { root } = await setup('---\nAviso importante\n---\ncorpo');

      expect(root).toHaveTextContent('Aviso importante');
      expect(root).toHaveTextContent('corpo');
    });
  });

  it('Dado o Markdown renderizado, então o axe não aponta violações', async () => {
    const { container } = await setup(
      '# Título\n\nTexto com [link](https://exemplo.com) e [[MacBook]].\n\n- [x] feita\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```\ncódigo\n```',
      [aWikilink()],
    );

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
