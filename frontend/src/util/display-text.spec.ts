import { displayText } from '~/util/display-text';

const RLO = '\u{202e}';

describe('displayText (F7)', () => {
  it('Dado RLO no nome do arquivo, então vira marca visível e nada reordena o resto', () => {
    expect(displayText(`recibo${RLO}fdp.exe`)).toBe('recibo‹U+202E›fdp.exe');
    expect(displayText(`recibo${RLO}fdp.exe`)).not.toContain(RLO);
  });

  it.each([
    ['\u{202a}', '‹U+202A›'],
    ['\u{2066}', '‹U+2066›'],
    ['\u{2069}', '‹U+2069›'],
    ['\u{200b}', '‹U+200B›'],
    ['\u{200d}', '‹U+200D›'],
    ['\u{feff}', '‹U+FEFF›'],
    ['\u{2060}', '‹U+2060›'],
    ['\u{61c}', '‹U+061C›'],
    ['\u{1b}', '‹U+001B›'],
    ['\u{7f}', '‹U+007F›'],
    ['\u{85}', '‹U+0085›'],
  ])('Dado o caractere invisível %j, então aparece como %s', (char, shown) => {
    expect(displayText(`a${char}b`)).toBe(`a${shown}b`);
  });

  it('Dado texto comum, acentos e emoji, então não muda', () => {
    expect(displayText('Revisão de outubro: ação 😀 café')).toBe(
      'Revisão de outubro: ação 😀 café',
    );
  });

  it('Dado quebra de linha, então em campo de uma linha também vira marca; no corpo (multiline) é mantida', () => {
    expect(displayText('a\nb\tc')).toBe('a‹U+000A›b‹U+0009›c');
    expect(displayText('a\nb\tc', { multiline: true })).toBe('a\nb\tc');
    expect(displayText(`a${RLO}b\n`, { multiline: true })).toBe('a‹U+202E›b\n');
  });
});
