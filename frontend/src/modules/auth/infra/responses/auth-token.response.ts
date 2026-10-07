import type { components } from '~/util/api/schema.gen';

/** `AuthToken` do contrato (`POST /v1/auth/login` e `/refresh`). */
export type AuthTokenResponse = components['schemas']['AuthToken'];
/** Corpo do `POST /v1/auth/login`. */
export type LoginRequest = components['schemas']['LoginRequest'];
