/** Nome de quem está do outro lado da dívida: a pessoa ou, no credor livre, o `creditorName`. */
export function counterpartyName(debt: {
  readonly person: { readonly name: string } | null;
  readonly creditorName: string | null;
}): string {
  return debt.person?.name ?? debt.creditorName ?? '';
}
