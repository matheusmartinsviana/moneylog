import type {
  Commitment,
  CommitmentInput,
  CommitmentProgressInput,
} from '~/modules/commitments/core/types/commitment';
import type {
  CommitmentProgressRequest,
  CommitmentRequest,
  CommitmentResponse,
} from '~/modules/commitments/infra/responses/commitment.response';
import type { Money } from '~/util/money';

/** Resposta → tipos do core. Só copia campos: nenhum valor é somado nem convertido para `number`. */
const money = (value: { amount: string; currency: string }): Money => ({
  amount: value.amount,
  currency: value.currency,
});
const optionalMoney = (value: { amount: string; currency: string } | null): Money | null =>
  value ? money(value) : null;

export function toCommitment(response: CommitmentResponse): Commitment {
  return {
    id: response.id,
    kind: response.kind,
    name: response.name,
    counterparty: response.counterparty,
    notes: response.notes,
    total: optionalMoney(response.total),
    paid: optionalMoney(response.paid),
    nominalBalance: optionalMoney(response.nominalBalance),
    progress: response.progress,
    installmentsTotal: response.installmentsTotal,
    installmentsPaid: response.installmentsPaid,
    remainingInstallments: response.remainingInstallments,
    nextDueDate: response.nextDueDate,
    directPending: optionalMoney(response.directPending),
    financingPending: optionalMoney(response.financingPending),
    pendingByMonth: response.pendingByMonth.map((month) => ({
      competence: month.competence,
      amount: money(month.amount),
    })),
    schedule: response.schedule.map((item) => ({
      position: item.position,
      label: item.label,
      type: item.type,
      dueDate: item.dueDate,
      amount: money(item.amount),
      paid: item.paid,
      paidOn: item.paidOn,
    })),
    version: response.version,
  };
}

export function toCommitmentRequest(input: CommitmentInput): CommitmentRequest {
  const tracked = input.kind === 'TRACKED_THIRD_PARTY';
  const counterparty = input.counterparty?.trim() ?? '';
  const notes = input.notes?.trim() ?? '';
  return {
    kind: input.kind,
    name: input.name.trim(),
    ...(counterparty === '' ? {} : { counterparty }),
    ...(notes === '' ? {} : { notes }),
    ...(tracked
      ? {
          installmentsTotal: input.installmentsTotal,
          installmentsPaid: input.installmentsPaid ?? 0,
          ...(input.paidAmount ? { paidAmount: input.paidAmount } : {}),
          ...(input.nextDueDate ? { nextDueDate: input.nextDueDate } : {}),
        }
      : {
          schedule: (input.schedule ?? []).map((item) => ({
            label: item.label.trim(),
            type: item.type,
            amount: item.amount,
            paid: item.paid,
            ...(item.dueDate ? { dueDate: item.dueDate } : {}),
            ...(item.paid && item.paidOn ? { paidOn: item.paidOn } : {}),
          })),
        }),
  };
}

export function toProgressRequest(input: CommitmentProgressInput): CommitmentProgressRequest {
  const notes = input.notes?.trim() ?? '';
  return {
    installmentsPaid: input.installmentsPaid,
    version: input.version,
    ...(input.paidAmount ? { paidAmount: input.paidAmount } : {}),
    ...(input.nextDueDate ? { nextDueDate: input.nextDueDate } : {}),
    ...(notes === '' ? {} : { notes }),
  };
}
