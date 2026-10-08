import { computed, inject, Injectable, signal } from '@angular/core';
import {
  catchError,
  defaultIfEmpty,
  forkJoin,
  exhaustMap,
  finalize,
  map,
  Observable,
  of,
  share,
  Subject,
  switchMap,
  tap,
  throwError,
  timeout,
} from 'rxjs';

import { AuthGateway } from '~/modules/auth/core/interfaces/auth.gateway';
import { SESSION_END_HOOKS } from '~/modules/auth/core/interfaces/session-end-hook';
import { AuthFailure } from '~/modules/auth/core/types/auth-failure';
import type {
  AuthToken,
  Credentials,
  SetupPasswordInput,
} from '~/modules/auth/core/types/auth-token';

/**
 * - `unknown`: o refresh silencioso do boot ainda não terminou;
 * - `authenticated`: há um token em memória;
 * - `anonymous`: sem sessão (vai para `/login`);
 * - `unreachable`: o boot não conseguiu falar com o servidor (offline, S-93): a sessão não foi
 *   perdida e o app abre; a primeira chamada que dê 401 tenta o refresh de novo.
 */
export type SessionStatus = 'unknown' | 'authenticated' | 'anonymous' | 'unreachable';

export type LoginState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'failed'; readonly failure: AuthFailure };

/** Estado do envio do primeiro acesso (mesmo formato do login). */
export type SetupState = LoginState;

const IDLE: LoginState = { status: 'idle' };
const SUBMITTING: LoginState = { status: 'submitting' };

function asFailure(error: unknown): AuthFailure {
  return error instanceof AuthFailure ? error : new AuthFailure('unavailable');
}

/**
 * Sessão do usuário (T33, S-65). O access token fica **só em memória** (campo privado, nunca em
 * `localStorage`/`sessionStorage`); o refresh token é um cookie `HttpOnly` que o JS não enxerga.
 *
 * Singleton: o interceptor, o guard, o login e "Sair" compartilham o mesmo estado.
 */
@Injectable({ providedIn: 'root' })
export class SessionFacade {
  private readonly gateway = inject(AuthGateway);
  private readonly endHooks = inject(SESSION_END_HOOKS, { optional: true }) ?? [];
  private readonly current = signal<SessionStatus>('unknown');
  private readonly currentLogin = signal<LoginState>(IDLE);
  private readonly submissions = new Subject<Credentials>();
  private readonly currentSetup = signal<SetupState>(IDLE);
  private readonly setupSubmissions = new Subject<SetupPasswordInput>();
  private readonly signedInEvents = new Subject<void>();
  private accessToken: string | null = null;
  private inflight: Observable<string> | null = null;

  readonly status = this.current.asReadonly();
  readonly authenticated = computed(() => this.current() === 'authenticated');
  readonly loginState = this.currentLogin.asReadonly();
  readonly setupState = this.currentSetup.asReadonly();
  /** Emite quando um login termina com sucesso (a tela de login navega para o `returnUrl`). */
  readonly signedIn$ = this.signedInEvents.asObservable();

  constructor() {
    // exhaustMap: clique duplo no "Entrar" vira uma requisição só; o segundo envio é ignorado
    // enquanto o primeiro não termina (FE 02).
    this.submissions
      .pipe(
        exhaustMap((credentials) => {
          this.currentLogin.set(SUBMITTING);
          return this.gateway.login(credentials).pipe(
            tap((token) => this.authenticate(token)),
            map((): LoginState => IDLE),
            catchError((error: unknown) =>
              of<LoginState>({ status: 'failed', failure: asFailure(error) }),
            ),
          );
        }),
      )
      .subscribe((state) => {
        this.currentLogin.set(state);
        if (state.status === 'idle') this.signedInEvents.next();
      });

    this.setupSubmissions
      .pipe(
        exhaustMap((input) => {
          this.currentSetup.set(SUBMITTING);
          return this.gateway.setupPassword(input).pipe(
            tap((token) => this.authenticate(token)),
            map((): SetupState => IDLE),
            catchError((error: unknown) =>
              of<SetupState>({ status: 'failed', failure: asFailure(error) }),
            ),
          );
        }),
      )
      .subscribe((state) => {
        this.currentSetup.set(state);
        if (state.status === 'idle') this.signedInEvents.next();
      });
  }

  /**
   * Consulta se o dono precisa definir a senha. Nunca falha: `null` quando não deu para consultar
   * (a tela cai no login normal com um aviso).
   */
  passwordSetupRequired(): Observable<boolean | null> {
    return this.gateway.passwordSetupRequired().pipe(catchError(() => of(null)));
  }

  /** Envia o primeiro acesso. O resultado vem em `setupState` e `signedIn$`. */
  setupPassword(input: SetupPasswordInput): void {
    this.setupSubmissions.next(input);
  }

  /** Token atual para o `Authorization` (nunca é exposto em signal nem em template). */
  token(): string | null {
    return this.accessToken;
  }

  /** Envia o formulário de login. O resultado vem em `loginState` e `signedIn$`. */
  login(credentials: Credentials): void {
    this.submissions.next(credentials);
  }

  /**
   * Restauração silenciosa do boot (`provideAppInitializer`): tenta o refresh pelo cookie. Nunca
   * lança: 401 → `anonymous`; sem rede ou outro erro → `unreachable` (S-93), para o shell abrir com
   * o estado de erro e "tentar de novo" em vez de expulsar o usuário.
   */
  async restore(): Promise<void> {
    this.current.set('unknown');
    await new Promise<void>((resolve) => {
      this.refresh().subscribe({
        next: () => resolve(),
        error: (error: unknown) => {
          const refused = asFailure(error).reason === 'refresh_invalid';
          this.current.set(refused ? 'anonymous' : 'unreachable');
          resolve();
        },
      });
    });
  }

  /**
   * Refresh com **uma** chamada só: requisições paralelas que recebem 401 compartilham o mesmo
   * `POST /v1/auth/refresh`. Devolve o novo access token. Falha com `AuthFailure`; só
   * `refresh_invalid` significa que a sessão acabou (quem chama decide limpar).
   */
  refresh(): Observable<string> {
    if (!this.inflight) {
      this.inflight = this.gateway.refresh().pipe(
        tap((token) => this.authenticate(token)),
        map((token) => token.accessToken),
        catchError((error: unknown) => throwError(() => asFailure(error))),
        finalize(() => (this.inflight = null)),
        share(),
      );
    }
    return this.inflight;
  }

  /**
   * Novo token depois de um 401. Se o token já mudou desde que a requisição saiu (outra requisição
   * já renovou), reaproveita-o em vez de gastar outro refresh.
   */
  refreshAfterUnauthorized(usedToken: string | null): Observable<string> {
    const token = this.accessToken;
    if (token !== null && token !== usedToken) return of(token);
    return this.refresh();
  }

  /** A sessão acabou (refresh recusado): apaga o token e marca como anônima. */
  clear(): void {
    this.accessToken = null;
    this.current.set('anonymous');
  }

  /**
   * "Sair": avisa o backend (revoga a família do refresh) e limpa a sessão mesmo se a chamada
   * falhar (offline): o token em memória é descartado de qualquer jeito.
   */
  logout(): Observable<void> {
    return this.runEndHooks().pipe(
      switchMap(() => this.gateway.logout()),
      catchError(() => of(undefined)),
      tap(() => this.clear()),
      map(() => undefined),
    );
  }

  /**
   * Melhor esforço: roda os ganchos de fim de sessão (ex.: cancelar o push no backend) antes do logout,
   * enquanto o token ainda vale. Falha ou demora (3 s) de um gancho não trava o "Sair".
   */
  private runEndHooks(): Observable<unknown> {
    if (this.endHooks.length === 0) return of(undefined);
    return forkJoin(
      this.endHooks.map((hook) =>
        hook().pipe(
          timeout(3000),
          catchError(() => of(undefined)),
          defaultIfEmpty(undefined),
        ),
      ),
    );
  }

  private authenticate(token: AuthToken): void {
    this.accessToken = token.accessToken;
    this.current.set('authenticated');
  }
}
