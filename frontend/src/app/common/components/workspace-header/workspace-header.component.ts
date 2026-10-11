import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  InjectionToken,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

import { GlobalSearchComponent } from '~/app/common/components/global-search/global-search.component';
import { IconComponent } from '~/app/common/components/icon/icon.component';
import { LiquidGlassDirective } from '~/app/common/components/liquid-glass/liquid-glass.directive';
import { ProfileMenuComponent } from '~/app/common/components/profile-menu/profile-menu.component';
import { TooltipDirective } from '~/app/common/components/tooltip/tooltip.directive';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { ThemeService } from '~/app/common/services/theme.service';
import { NotificationsPopoverComponent } from '~/app/features/notifications/components/notifications-popover.component';
import { UnreadCountFacade } from '~/modules/notifications/core/facades/unread-count.facade';

/**
 * Hora local (0 a 23) usada **só** para escolher "Bom dia", "Boa tarde" ou "Boa noite" (FE-S-211): nenhuma
 * data ou valor financeiro depende dela (as datas vêm do backend, `asOf`). Injetável para o teste.
 */
export const GREETING_HOUR = new InjectionToken<() => number>('GREETING_HOUR', {
  providedIn: 'root',
  factory: () => () => new Date().getHours(),
});

export type GreetingPeriod = 'morning' | 'afternoon' | 'evening';

/** 05:00 a 11:59 manhã; 12:00 a 17:59 tarde; o restante, noite. */
export function greetingPeriod(hour: number): GreetingPeriod {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

/**
 * Cabeçalho do workspace (DS 02, T194), no shell de todas as rotas, **compacto e em uma linha só**:
 * - **saudação** (sem nome, D4) e subtítulo **só no Início** (as demais telas têm o `h1` próprio);
 * - **busca global** (T209) em pílula; em tela compacta, um botão de lupa que abre uma folha;
 * - à direita: tema (sol/lua, alterna claro e escuro), **sino** de notificações (abre um pop-up com as últimas, com o
 *   contador de não lidas do backend, polling leve só com a aba visível) e o avatar genérico (menu do perfil). O
 *   estado da IA fica na sidebar (item "IA").
 * As ações rápidas (adicionar despesa/receita, transferir, emprestei) moraram aqui e foram para o cartão do
 * Quick Capture no Início; nas demais telas o "+" da sidebar e da barra inferior leva ao registro. Presentational + roteador.
 */
@Component({
  selector: 'app-workspace-header',
  imports: [
    GlobalSearchComponent,
    IconComponent,
    LiquidGlassDirective,
    NotificationsPopoverComponent,
    ProfileMenuComponent,
    TooltipDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './workspace-header.component.html',
  styleUrl: './workspace-header.component.css',
})
export class WorkspaceHeaderComponent {
  private readonly router = inject(Router);
  private readonly hour = inject(GREETING_HOUR);
  protected readonly t = inject(I18nService).t;
  private readonly unread = inject(UnreadCountFacade);

  private readonly theme = inject(ThemeService);
  /** Sol quando o tema na tela é claro, lua quando é escuro (o botão alterna claro e escuro). */
  protected readonly themeIcon = computed(() =>
    this.theme.effective() === 'dark' ? 'moon' : 'sun',
  );
  protected readonly themeLabel = computed(() => {
    const copy = this.t().header.theme;
    return this.theme.effective() === 'dark' ? copy.toLight : copy.toDark;
  });

  /** Alterna claro e escuro; "Sistema" continua nas Configurações. */
  protected cycleTheme(): void {
    this.theme.set(this.theme.effective() === 'dark' ? 'light' : 'dark');
  }

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  protected readonly onHome = computed(() => (this.url().split(/[?#]/)[0] ?? '') === '/');
  constructor() {
    this.unread.connect(inject(DestroyRef));
  }

  protected readonly greeting = computed(
    () => this.t().header.greeting[greetingPeriod(this.hour())],
  );
}
