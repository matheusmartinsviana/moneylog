import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  InjectionToken,
  OnInit,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';

import { ChipComponent } from '~/app/common/components/chip/chip.component';
import { GlobalSearchComponent } from '~/app/common/components/global-search/global-search.component';
import { IconComponent } from '~/app/common/components/icon/icon.component';
import { ProfileMenuComponent } from '~/app/common/components/profile-menu/profile-menu.component';
import { TooltipDirective } from '~/app/common/components/tooltip/tooltip.directive';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { CaptureRequestType, QuickCaptureBus } from '~/app/common/services/quick-capture-bus';
import { ThemePreference, ThemeService } from '~/app/common/services/theme.service';
import { AiStatusFacade } from '~/modules/ai/core/facades/ai-status.facade';
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
 * Cabeçalho do workspace (DS 02, T194), no shell de todas as rotas:
 * - **saudação** (sem nome, D4) e subtítulo **só no Início** (as demais telas têm o `h1` próprio: uma
 *   saudação em toda tela duplicaria o título);
 * - **busca global** (T209) no espaço central; em tela compacta, um botão de lupa que abre uma folha;
 * - **ações rápidas**: "Adicionar despesa/receita" e "Transferir" levam a `/quick-add?mode=`; no Início, em vez de
 *   navegar, trocam o tipo do Quick Capture e o focam; "Perguntar à IA" leva a `/ai` só com a IA ligada (`GET /v1/ai/status`);
 *   desligada, fica desabilitado (`aria-disabled`, com a dica). **Um só botão primário por tela (M6):** no Início todas são secundárias (o
 *   primário é o "Novo registro" do atalho do Quick Capture); nas outras telas "Adicionar despesa" segue primário;
 * - chip **"IA desligada"** (verdadeiro hoje; não chama endpoint que não existe) e menu do perfil no
 *   mobile (de 768 px em diante o perfil fica no rodapé da sidebar);
 * - **sino** de notificações (Etapa 7): leva à central e mostra o contador de não lidas do backend (polling
 *   leve só com a aba visível); sem número conhecido, o sino aparece sem contador.
 * Presentational + roteador.
 */
@Component({
  selector: 'app-workspace-header',
  imports: [
    RouterLink,
    ChipComponent,
    GlobalSearchComponent,
    IconComponent,
    ProfileMenuComponent,
    TooltipDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './workspace-header.component.html',
  styleUrl: './workspace-header.component.css',
})
export class WorkspaceHeaderComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly hour = inject(GREETING_HOUR);
  private readonly captureBus = inject(QuickCaptureBus);
  protected readonly t = inject(I18nService).t;
  private readonly unread = inject(UnreadCountFacade);
  protected readonly aiStatus = inject(AiStatusFacade);

  private readonly theme = inject(ThemeService);
  protected readonly themeIcon = computed(() => {
    const p = this.theme.preference();
    return p === 'light' ? 'sun' : p === 'dark' ? 'moon' : 'monitor';
  });
  protected readonly themeLabel = computed(() => {
    const copy = this.t().header.theme;
    const next = this.nextTheme(this.theme.preference());
    return interpolate(copy.toggle, {
      current: copy[this.theme.preference()],
      next: copy[next],
    });
  });

  /** Ciclo: Sistema, Claro, Escuro. */
  protected cycleTheme(): void {
    this.theme.set(this.nextTheme(this.theme.preference()));
  }

  private nextTheme(current: ThemePreference): ThemePreference {
    return current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
  }

  protected readonly unreadCount = this.unread.count;
  protected readonly bellLabel = computed(() => {
    const copy = this.t().notifications.bell;
    const count = this.unread.count() ?? 0;
    if (count <= 0) return copy.label;
    return count === 1 ? copy.one : interpolate(copy.many, { count: String(count) });
  });

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  protected readonly onHome = computed(() => (this.url().split(/[?#]/)[0] ?? '') === '/');
  /** No Início, "Adicionar despesa/receita" foca o Quick Capture; nas outras telas o link segue para `/quick-add`. */
  protected quickAction(event: Event, type: CaptureRequestType): void {
    if (!this.onHome()) return;
    event.preventDefault();
    this.captureBus.open(type);
  }

  ngOnInit(): void {
    this.aiStatus.ensureLoaded();
  }

  constructor() {
    this.unread.connect(inject(DestroyRef));
  }

  protected readonly greeting = computed(
    () => this.t().header.greeting[greetingPeriod(this.hour())],
  );
}
