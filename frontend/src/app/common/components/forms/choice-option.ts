/** Opção de `SegmentedControl` e `Select`. O texto já vem traduzido de quem usa o campo. */
export interface ChoiceOption {
  /** Valor gravado no controle e sufixo do `data-cy` da opção. */
  readonly value: string;
  readonly label: string;
  /** Opção visível mas indisponível (ex.: "Crédito", disponível em breve, S-58). */
  readonly disabled?: boolean;
  /** Texto curto de apoio (ex.: saldo da conta, "disponível em breve"). */
  readonly hint?: string;
  /** Idioma do rótulo (ex.: nome do idioma na própria língua), quando difere do da interface. */
  readonly lang?: string;
}

/** Próxima opção habilitada a partir de `from`, andando `step` (±1), com volta ao início. */
export function nextEnabled(
  options: readonly ChoiceOption[],
  from: number,
  step: 1 | -1,
  wrap = true,
): number {
  const total = options.length;
  for (let i = 1; i <= total; i++) {
    const index = from + step * i;
    if (!wrap && (index < 0 || index >= total)) return from;
    const wrapped = (index + total) % total;
    if (!options[wrapped]?.disabled) return wrapped;
  }
  return from;
}

/** Primeira (ou última) opção habilitada; -1 se não houver nenhuma. */
export function edgeEnabled(options: readonly ChoiceOption[], edge: 'first' | 'last'): number {
  const indexes = options.map((_, i) => i).filter((i) => !options[i]?.disabled);
  return (edge === 'first' ? indexes[0] : indexes[indexes.length - 1]) ?? -1;
}
