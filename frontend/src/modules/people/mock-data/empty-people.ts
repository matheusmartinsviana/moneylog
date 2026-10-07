import type { PersonSliceResponse } from '~/modules/people/infra/responses/person.response';

/** Ambiente mock (S-67): o usuário ainda não cadastrou ninguém. Mesmo formato bruto da API. */
export const EMPTY_PEOPLE: PersonSliceResponse = { items: [], hasNext: false };
