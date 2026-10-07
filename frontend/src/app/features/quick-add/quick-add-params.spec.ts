import { sanitizeSharedText } from '~/app/features/quick-add/quick-add-params';

describe('sanitizeSharedText (T137 CA2)', () => {
  it('Dado texto comum, então devolve o mesmo texto', () => {
    expect(sanitizeSharedText('almoço')).toBe('almoço');
  });

  it('Dado HTML, então tira a marcação (a tela nunca renderiza HTML)', () => {
    expect(sanitizeSharedText('<img src=x onerror=alert(1)>almoço<script>x</script>')).toBe(
      'almoço x',
    );
  });

  it('Dado controle e espaços, então normaliza', () => {
    expect(sanitizeSharedText('  a\u0000b\n\n  c ')).toBe('a b c');
  });

  it('Dado texto enorme, então corta em 200', () => {
    expect(sanitizeSharedText('x'.repeat(500))).toHaveLength(200);
  });

  it('Dado null, então vazio', () => {
    expect(sanitizeSharedText(null)).toBe('');
  });
});
