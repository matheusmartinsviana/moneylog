import type {
  Person,
  PersonDetail,
  PersonInput,
  PersonUpdate,
} from '~/modules/people/core/types/person';
import type {
  PersonCreateRequest,
  PersonDetailResponse,
  PersonResponse,
  PersonUpdateRequest,
} from '~/modules/people/infra/responses/person.response';
import { toDebtSummary } from '~/util/debt';
import type { Money } from '~/util/money';

/** Resposta → tipos do core. Só copia campos: nenhum valor é somado nem convertido para `number`. */
const money = (value: { amount: string; currency: string }): Money => ({
  amount: value.amount,
  currency: value.currency,
});

export function toPerson(response: PersonResponse | PersonDetailResponse): Person {
  return {
    id: response.id,
    name: response.name,
    notes: response.notes,
    archived: response.archived,
    net: money(response.net),
    direction: response.direction,
    openDebts: response.openDebts,
    nextDueDate: response.nextDueDate,
    version: response.version,
  };
}

export function toPersonDetail(response: PersonDetailResponse): PersonDetail {
  return { ...toPerson(response), debts: response.debts.map(toDebtSummary) };
}

/** Observações vazias vão como `null`. */
function notesOf(notes: string | null): string | null {
  return notes !== null && notes.trim() !== '' ? notes.trim() : null;
}

export function toCreateRequest(input: PersonInput): PersonCreateRequest {
  return { name: input.name.trim(), notes: notesOf(input.notes) };
}

export function toUpdateRequest(input: PersonUpdate): PersonUpdateRequest {
  return { ...toCreateRequest(input), version: input.version };
}
