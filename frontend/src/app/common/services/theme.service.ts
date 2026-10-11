import { DOCUMENT } from '@angular/common';
import { computed, inject, Injectable, signal } from '@angular/core';

import { motionEnabled } from '~/app/common/motion/motion';
import { readStorage, removeStorage, writeStorage } from '~/util/safe-storage';

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export const THEME_STORAGE_KEY = 'moneylog.theme';

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value);
}

/**
 * Tema da UI. `system` segue `prefers-color-scheme` (sem atributo no `<html>`);
 * `light`/`dark` gravam `data-theme` e valem mesmo contra a preferência do sistema, e reescrevem as metas
 * `theme-color` (que o HTML declara por `prefers-color-scheme`) para a barra do navegador seguir a escolha
 * do usuário e não só a do sistema (BUG-QA-04).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly preferenceState = signal<ThemePreference>('system');

  private initialized = false;

  readonly preference = this.preferenceState.asReadonly();

  /** O sistema está em escuro agora (`prefers-color-scheme`); só conta quando a preferência é `system`. */
  private readonly systemDark = signal(false);
  private mediaWatched = false;

  /** Tema que está de fato na tela (`light` ou `dark`), mesmo com a preferência `system`. */
  readonly effective = computed<'light' | 'dark'>(() => {
    const preference = this.preferenceState();
    if (preference !== 'system') return preference;
    return this.systemDark() ? 'dark' : 'light';
  });

  constructor() {
    this.watchSystem();
  }

  /** Aplica a preferência salva (ou `system`). */
  init(): void {
    this.watchSystem();
    const stored = readStorage(THEME_STORAGE_KEY);
    this.apply(isThemePreference(stored) ? stored : 'system');
  }

  /** Troca o tema e persiste a escolha neste dispositivo. */
  set(preference: ThemePreference): void {
    this.apply(preference);
    if (preference === 'system') {
      removeStorage(THEME_STORAGE_KEY);
    } else {
      writeStorage(THEME_STORAGE_KEY, preference);
    }
  }

  private watchSystem(): void {
    if (this.mediaWatched) return;
    this.mediaWatched = true;
    const query = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
    if (!query) return;
    this.systemDark.set(query.matches);
    query.addEventListener('change', (event) => this.systemDark.set(event.matches));
  }

  private apply(preference: ThemePreference): void {
    const animate = this.preferenceState() !== preference && this.initialized;
    this.initialized = true;
    this.preferenceState.set(preference);
    const root = this.document.documentElement;
    if (animate && motionEnabled(this.document)) {
      // Transição curta só nas cores (motion.css), removida logo depois.
      root.classList.add('m-theme-switch');
      setTimeout(() => root.classList.remove('m-theme-switch'), 300);
    }
    if (preference === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', preference);
    }
    this.syncThemeColor(preference);
  }

  /**
   * Escolha manual: as duas metas passam a ter a cor do `canvas` do tema escolhido (a que o HTML já declara
   * para aquele `prefers-color-scheme`; `check-styles` a mantém igual ao token). Sistema: restaura as do HTML.
   */
  private syncThemeColor(preference: ThemePreference): void {
    const metas = Array.from(
      this.document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
    );
    for (const meta of metas) {
      meta.dataset['themeColorOriginal'] ??= meta.content;
    }
    const original = (meta: HTMLMetaElement) => meta.dataset['themeColorOriginal'] ?? meta.content;
    const chosen =
      preference === 'system'
        ? null
        : metas.find((meta) => meta.media.includes(`prefers-color-scheme: ${preference}`));
    for (const meta of metas) {
      meta.content = chosen ? original(chosen) : original(meta);
    }
  }
}
