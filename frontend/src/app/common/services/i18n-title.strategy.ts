import { effect, inject, Injectable, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

import type { NavKey } from '~/app/common/components/app-shell/navigation';
import { I18nService } from '~/app/common/i18n/i18n.service';

export type PageTitleKey = NavKey | 'notFound' | 'login';

/** Chave tipada para o `title` das rotas: o texto vem do i18n ativo. */
export function pageTitle(key: PageTitleKey): string {
  return key;
}

/**
 * Título do documento a partir da chave da rota e do idioma ativo
 * (`Cartões · moneylog`). Atualiza também quando o idioma muda.
 */
@Injectable({ providedIn: 'root' })
export class I18nTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly i18n = inject(I18nService);
  private readonly key = signal<PageTitleKey | null>(null);

  constructor() {
    super();
    effect(() => {
      const key = this.key();
      if (!this.i18n.ready()) return;
      const t = this.i18n.t();
      const page =
        key === null
          ? null
          : key === 'notFound'
            ? t.notFound.pageTitle
            : key === 'login'
              ? t.auth.pageTitle
              : t.nav[key];
      this.title.setTitle(page ? `${page} · ${t.shell.brand}` : t.shell.brand);
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.key.set((this.buildTitle(snapshot) as PageTitleKey | undefined) ?? null);
  }
}
