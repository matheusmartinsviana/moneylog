import { TestBed } from '@angular/core/testing';

import {
  isThemePreference,
  THEME_STORAGE_KEY,
  ThemeService,
} from '~/app/common/services/theme.service';

describe('ThemeService', () => {
  const root = () => document.documentElement;
  const service = () => TestBed.inject(ThemeService);

  it('Dado nenhuma preferência salva, quando inicio, então segue o sistema (sem data-theme)', () => {
    service().init();

    expect(service().preference()).toBe('system');
    expect(root().hasAttribute('data-theme')).toBe(false);
  });

  it('Dado o usuário escolhe claro, então data-theme="light" vale e a escolha persiste', () => {
    service().set('light');

    expect(root().getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('Dado escuro salvo, quando inicio, então aplica data-theme="dark"', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    service().init();

    expect(service().preference()).toBe('dark');
    expect(root().getAttribute('data-theme')).toBe('dark');
  });

  it('Dado uma escolha manual, quando volto para sistema, então remove o atributo e a preferência salva', () => {
    service().set('dark');

    service().set('system');

    expect(root().hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('Dado um valor inválido salvo, quando inicio, então segue o sistema', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'neon');

    service().init();

    expect(service().preference()).toBe('system');
  });

  it('Dado o storage bloqueado, então a troca de tema funciona sem persistir', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    service().set('dark');

    expect(root().getAttribute('data-theme')).toBe('dark');
    setItem.mockRestore();
  });

  it('isThemePreference aceita só system, light e dark', () => {
    expect(isThemePreference('light')).toBe(true);
    expect(isThemePreference('sepia')).toBe(false);
  });

  describe('meta theme-color (BUG-QA-04)', () => {
    const metas = () =>
      Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));

    beforeEach(() => {
      for (const [color, scheme] of [
        ['#f4f4f2', 'light'],
        ['#0b0b0d', 'dark'],
      ] as const) {
        const meta = document.createElement('meta');
        meta.name = 'theme-color';
        meta.content = color;
        meta.media = `(prefers-color-scheme: ${scheme})`;
        document.head.appendChild(meta);
      }
    });

    afterEach(() => metas().forEach((meta) => meta.remove()));

    it('Dado o usuário escolhe escuro, então as duas metas passam a ter a cor do canvas escuro', () => {
      service().set('dark');

      expect(metas().map((m) => m.content)).toEqual(['#0b0b0d', '#0b0b0d']);
    });

    it('Dado o usuário escolhe claro, então as duas metas têm o canvas claro', () => {
      service().set('light');

      expect(metas().map((m) => m.content)).toEqual(['#f4f4f2', '#f4f4f2']);
    });

    it('Dado uma escolha manual, quando volto para o sistema, então as cores originais do HTML voltam', () => {
      service().set('dark');

      service().set('system');

      expect(metas().map((m) => m.content)).toEqual(['#f4f4f2', '#0b0b0d']);
    });

    it('Dado escuro salvo, quando inicio, então a meta já nasce com o tema escolhido', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'dark');

      service().init();

      expect(metas().map((m) => m.content)).toEqual(['#0b0b0d', '#0b0b0d']);
    });
  });
});
