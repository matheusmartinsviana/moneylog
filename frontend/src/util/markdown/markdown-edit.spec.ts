import {
  completeWikilink,
  type Edit,
  indent,
  insertLink,
  insertWikilink,
  toggleLinePrefix,
  toggleWrap,
  wikilinkContext,
} from '~/util/markdown/markdown-edit';

/** Aplica a edição e devolve o texto e a seleção resultantes (o que o `replaceRange` faz no navegador). */
function apply(text: string, edit: Edit | null): { text: string; selected: string } {
  if (!edit) return { text, selected: '' };
  const next = text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
  return { text: next, selected: next.slice(edit.selectStart, edit.selectEnd) };
}

describe('toggleWrap', () => {
  it('Dado texto selecionado, então envolve com o marcador e mantém a seleção no miolo', () => {
    const result = apply('um dois três', toggleWrap('um dois três', { start: 3, end: 7 }, '**'));
    expect(result).toEqual({ text: 'um **dois** três', selected: 'dois' });
  });

  it('Dado sem seleção, então abre e fecha o marcador com o cursor no meio', () => {
    const result = apply('ab', toggleWrap('ab', { start: 1, end: 1 }, '*'));
    expect(result).toEqual({ text: 'a**b', selected: '' });
  });

  it('Dado texto já envolvido por fora da seleção, então desfaz', () => {
    const result = apply(
      'um **dois** três',
      toggleWrap('um **dois** três', { start: 5, end: 9 }, '**'),
    );
    expect(result).toEqual({ text: 'um dois três', selected: 'dois' });
  });

  it('Dado seleção que já inclui os marcadores, então desfaz', () => {
    const result = apply(
      'um **dois** três',
      toggleWrap('um **dois** três', { start: 3, end: 11 }, '**'),
    );
    expect(result).toEqual({ text: 'um dois três', selected: 'dois' });
  });
});

describe('links', () => {
  it('Dado seleção, então vira o texto do link e deixa a url selecionada', () => {
    const result = apply('veja isto', insertLink('veja isto', { start: 5, end: 9 }));
    expect(result).toEqual({ text: 'veja [isto](url)', selected: 'url' });
  });

  it('Dado sem seleção, então usa "texto" como espaço reservado', () => {
    expect(apply('', insertLink('', { start: 0, end: 0 })).text).toBe('[texto](url)');
  });

  it('Dado wikilink, então envolve a seleção em [[ ]] e a mantém selecionada', () => {
    expect(apply('ver MacBook', insertWikilink('ver MacBook', { start: 4, end: 11 }))).toEqual({
      text: 'ver [[MacBook]]',
      selected: 'MacBook',
    });
    expect(apply('', insertWikilink('', { start: 0, end: 0 })).text).toBe('[[]]');
  });
});

describe('toggleLinePrefix', () => {
  it('Dado várias linhas, então prefixa todas as tocadas e depois desfaz', () => {
    const text = 'a\nb\nc';
    const on = apply(text, toggleLinePrefix(text, { start: 0, end: 3 }, '- '));
    expect(on.text).toBe('- a\n- b\nc');
    const off = apply(on.text, toggleLinePrefix(on.text, { start: 0, end: 7 }, '- '));
    expect(off.text).toBe('a\nb\nc');
  });

  it('Dado a linha 0 vazia (texto começando em \\n), então o cursor em 0 prefixa a linha vazia, sem intervalo invertido', () => {
    const edit = toggleLinePrefix('\nabc', { start: 0, end: 0 }, '- ');

    expect(edit.from).toBeLessThanOrEqual(edit.to);
    expect(apply('\nabc', edit).text).toBe('- \nabc');
  });

  it('Dado o cursor numa linha, então prefixa só ela', () => {
    expect(apply('a\nb', toggleLinePrefix('a\nb', { start: 3, end: 3 }, '> ')).text).toBe('a\n> b');
  });

  it('Dado seleção que termina no começo de uma linha, então não toca essa linha', () => {
    const text = 'a\nb\nc';
    expect(apply(text, toggleLinePrefix(text, { start: 0, end: 4 }, '- ')).text).toBe(
      '- a\n- b\nc',
    );
  });
});

describe('indent', () => {
  it('Dado Tab sem seleção, então insere o recuo no cursor', () => {
    expect(apply('ab', indent('ab', { start: 1, end: 1 }, false))).toEqual({
      text: 'a  b',
      selected: '',
    });
  });

  it('Dado Tab com várias linhas, então recua todas', () => {
    expect(apply('a\nb', indent('a\nb', { start: 0, end: 3 }, false)).text).toBe('  a\n  b');
  });

  it('Dado Shift+Tab, então tira o recuo; sem recuo, não faz nada', () => {
    expect(apply('  a\n b', indent('  a\n b', { start: 0, end: 6 }, true)).text).toBe('a\nb');
    expect(indent('a', { start: 0, end: 0 }, true)).toBeNull();
  });

  it('Dado Shift+Tab numa linha com tabulação, então a remove', () => {
    expect(apply('\ta', indent('\ta', { start: 2, end: 2 }, true)).text).toBe('a');
  });
});

describe('wikilinkContext', () => {
  it.each([
    ['ver [[mac', 9, 6, 'mac'],
    ['[[', 2, 2, ''],
    ['a\nver [[reviews/2026', 20, 8, 'reviews/2026'],
  ])('Dado %j com o cursor em %d, então há contexto', (text, caret, start, query) => {
    expect(wikilinkContext(text, caret)).toEqual({ start, query });
  });

  it.each([
    ['sem colchetes', 5],
    ['[[fechado]] depois', 14],
    ['[[quebra\nnova linha', 18],
    ['[[a [b', 6],
    ['```\n[[dentro do codigo', 20],
  ])('Dado %j com o cursor em %d, então não há contexto', (text, caret) => {
    expect(wikilinkContext(text, caret)).toBeNull();
  });

  it('Dado escolher uma nota, então troca o digitado pelo caminho e fecha com ]]', () => {
    const text = 'ver [[mac';
    const context = wikilinkContext(text, 9)!;
    expect(apply(text, completeWikilink(text, context, 9, 'projetos/MacBook'))).toEqual({
      text: 'ver [[projetos/MacBook]]',
      selected: '',
    });
  });

  it('Dado que os colchetes de fechamento já existem, então não duplica', () => {
    const text = 'ver [[mac]] fim';
    const context = wikilinkContext(text, 9)!;
    const result = apply(text, completeWikilink(text, context, 9, 'MacBook'));
    expect(result.text).toBe('ver [[MacBook]] fim');
  });
});
