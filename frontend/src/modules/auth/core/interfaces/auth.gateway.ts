import { Observable } from 'rxjs';

import type {
  AuthToken,
  Credentials,
  SetupPasswordInput,
} from '~/modules/auth/core/types/auth-token';

/**
 * Porta da autenticação (FE 01): o core define, a infra implementa e o bootstrap liga (S-31).
 * As implementações falham com `AuthFailure`.
 */
export abstract class AuthGateway {
  /** `POST /v1/auth/login`: o refresh token vai no cookie `HttpOnly`, fora do alcance do JS. */
  abstract login(credentials: Credentials): Observable<AuthToken>;

  /** `GET /v1/auth/status`: `true` quando o dono ainda precisa definir a senha (primeiro acesso). */
  abstract passwordSetupRequired(): Observable<boolean>;

  /** `POST /v1/auth/setup-password`: define a senha e abre a sessão (mesmo par do login). */
  abstract setupPassword(input: SetupPasswordInput): Observable<AuthToken>;

  /** `POST /v1/auth/refresh` (cookie): novo par, com rotação do cookie. */
  abstract refresh(): Observable<AuthToken>;

  /** `POST /v1/auth/logout`: revoga a família do refresh e expira o cookie. */
  abstract logout(): Observable<void>;
}
