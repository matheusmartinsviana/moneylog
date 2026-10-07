import { safeLink } from '~/util/markdown/safe-url';

describe('safeLink', () => {
  it.each([
    ['https://exemplo.com/a?b=1#c', 'https://exemplo.com/a?b=1#c', true],
    ['http://exemplo.com', 'http://exemplo.com/', true],
    ['mailto:oi@exemplo.com', 'mailto:oi@exemplo.com', false],
  ])('Dado %s, então vira link seguro', (input, href, external) => {
    expect(safeLink(input)).toEqual({ href, external });
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    '  javascript:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    '\u0001javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'data:image/svg+xml;base64,PHN2Zz4=',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'blob:https://x/1',
    'about:blank',
    'ftp://exemplo.com',
    '//exemplo.com/x',
    '/relativo',
    'nota.md',
    '#secao',
    '',
    'https://usuario:senha@exemplo.com',
    `https://exemplo.com/${'a'.repeat(3000)}`,
  ])('Dado %j, então não vira link', (input) => {
    expect(safeLink(input)).toBeNull();
  });
});
