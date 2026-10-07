import { highlightSegments } from '~/util/highlight';

describe('highlightSegments', () => {
  it('Dado termo vazio ou texto vazio, então um trecho sem marca', () => {
    expect(highlightSegments('Comprei o MacBook', '')).toEqual([
      { text: 'Comprei o MacBook', match: false },
    ]);
    expect(highlightSegments('', 'x')).toEqual([{ text: '', match: false }]);
  });

  it('Dado o termo, então marca sem diferenciar caixa', () => {
    expect(highlightSegments('Comprei o MacBook novo', 'macbook')).toEqual([
      { text: 'Comprei o ', match: false },
      { text: 'MacBook', match: true },
      { text: ' novo', match: false },
    ]);
  });

  it('Dado acento, então casa sem acento nos dois sentidos e preserva o texto original', () => {
    expect(highlightSegments('Revisão de outubro', 'revisao')).toEqual([
      { text: 'Revisão', match: true },
      { text: ' de outubro', match: false },
    ]);
    expect(highlightSegments('revisao', 'REVISÃO')).toEqual([{ text: 'revisao', match: true }]);
  });

  it('Dado várias ocorrências, então marca todas sem sobrepor', () => {
    const result = highlightSegments('aaa', 'aa');
    expect(result.map((s) => s.text).join('')).toBe('aaa');
    expect(result.filter((s) => s.match)).toHaveLength(1);
    expect(highlightSegments('gato e gato', 'gato').filter((s) => s.match)).toHaveLength(2);
  });

  it('Dado emoji e caracteres especiais, então não quebra o par substituto', () => {
    const result = highlightSegments('ok 😀 fim', '😀');
    expect(result.map((s) => s.text).join('')).toBe('ok 😀 fim');
    expect(result.find((s) => s.match)?.text).toBe('😀');
    expect(highlightSegments('a.b', '.').find((s) => s.match)?.text).toBe('.');
  });

  it('Dado texto com HTML, então segue como texto puro', () => {
    const result = highlightSegments('<script>alert(1)</script>', 'alert');
    expect(result.map((s) => s.text).join('')).toBe('<script>alert(1)</script>');
  });
});
