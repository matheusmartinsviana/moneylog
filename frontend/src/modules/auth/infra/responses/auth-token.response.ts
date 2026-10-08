import type { components } from '~/util/api/schema.gen';

/** `AuthToken` do contrato (`POST /v1/auth/login` e `/refresh`). */
export type AuthTokenResponse = components['schemas']['AuthToken'];
/** Corpo do `POST /v1/auth/login`. */
export type LoginRequest = components['schemas']['LoginRequest'];
/** `AuthStatus` do contrato (`GET /v1/auth/status`). */
export type AuthStatusResponse = components['schemas']['AuthStatus'];
/** Corpo do `POST /v1/auth/setup-password`. */
export type SetupPasswordRequest = components['schemas']['SetupPasswordRequest'];
