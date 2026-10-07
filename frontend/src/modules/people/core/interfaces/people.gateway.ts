import { Observable } from 'rxjs';

import type {
  Person,
  PersonDetail,
  PersonInput,
  PersonStatus,
  PersonUpdate,
} from '~/modules/people/core/types/person';
import type { Slice } from '~/util/api/slice';

export interface PeopleQuery {
  /** Sem `status`, o backend assume `ACTIVE`. */
  readonly status?: PersonStatus;
  /** Busca no nome (sem diferenciar maiúsculas e acentos); vazio não filtra. */
  readonly q?: string;
  readonly page: number;
  readonly pageSize: number;
}

/**
 * Porta de pessoas (FE 01). As implementações falham com `ProblemError` (`PERSON_ARCHIVED`,
 * `PERSON_NOT_FOUND`, `VERSION_CONFLICT`...).
 */
export abstract class PeopleGateway {
  abstract list(query: PeopleQuery): Observable<Slice<Person>>;
  abstract get(id: string): Observable<PersonDetail>;
  /** `Idempotency-Key`: uma por tentativa (o retry reusa); 409 `IDEMPOTENCY_KEY_REUSED` se o corpo mudar. */
  abstract create(input: PersonInput, idempotencyKey: string): Observable<Person>;
  abstract update(id: string, input: PersonUpdate): Observable<Person>;
  abstract archive(id: string): Observable<Person>;
  abstract unarchive(id: string): Observable<Person>;
}
