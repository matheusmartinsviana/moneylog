import type { NoteLink, NoteLinkRef } from '~/modules/notes/core/types/note';

/** A referência (`type` + `id`/`key`) que o backend aceita para um vínculo já resolvido. */
export function refOfLink(link: NoteLink): NoteLinkRef {
  return link.type === 'MONTHLY_SUMMARY'
    ? { type: link.type, key: link.target?.key ?? '' }
    : { type: link.type, id: link.target?.id ?? '' };
}

/** Os vínculos explícitos resolvidos de uma nota: o que se reenvia ao trocar os vínculos. */
export function explicitRefs(links: readonly NoteLink[]): readonly NoteLinkRef[] {
  return links
    .filter(
      (link) => link.origin === 'EXPLICIT' && link.state === 'RESOLVED' && link.target !== null,
    )
    .map(refOfLink);
}

export function sameRef(a: NoteLinkRef, b: NoteLinkRef): boolean {
  return a.type === b.type && a.id === b.id && a.key === b.key;
}

/** O que o usuário pediu para mudar nos vínculos: serve para refazer a ação sobre a versão mais nova da nota. */
export type LinkChange =
  | { readonly add: NoteLinkRef; readonly remove?: undefined }
  | { readonly remove: NoteLinkRef; readonly add?: undefined };

/** Aplica a mudança pedida sobre os vínculos explícitos de uma nota (sem duplicar). */
export function applyLinkChange(
  base: readonly NoteLinkRef[],
  change: LinkChange,
): readonly NoteLinkRef[] {
  if (change.add) {
    const added = change.add;
    return base.some((ref) => sameRef(ref, added)) ? base : [...base, added];
  }
  const removed = change.remove;
  return base.filter((ref) => !sameRef(ref, removed));
}
