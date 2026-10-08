/** Par devolvido pelo login e pelo refresh. O `accessToken` vive só em memória (S-65, FE 06). */
export interface AuthToken {
  readonly accessToken: string;
  /** Instante ISO-8601 UTC em que o token expira. */
  readonly expiresAt: string;
}

export interface Credentials {
  readonly email: string;
  readonly password: string;
}

/** Dados do primeiro acesso (`POST /v1/auth/setup-password`). A validação real é do servidor. */
export interface SetupPasswordInput {
  readonly email: string;
  readonly setupCode: string;
  readonly newPassword: string;
}
