import type {
  Backlink,
  ImportReport,
  Note,
  NoteInput,
  NoteLink,
  NoteLinkRef,
  NoteMoved,
  NoteSummary,
  TagCount,
} from '~/modules/notes/core/types/note';
import type {
  BacklinkResponse,
  ImportReportResponse,
  NoteCreateRequest,
  NoteLinkInputRequest,
  NoteLinkResponse,
  NoteMovedResponse,
  NoteResponse,
  NoteSummaryResponse,
  NoteTagCountResponse,
} from '~/modules/notes/infra/responses/note.response';

/** Resposta → tipos do core. Só copia campos: o corpo é guardado como veio (dado, nunca HTML). */
function toLink(link: NoteLinkResponse): NoteLink {
  return {
    origin: link.origin,
    type: link.type,
    state: link.state,
    text: link.text,
    alias: link.alias,
    section: link.section,
    embed: link.embed,
    target: link.target
      ? {
          id: link.target.id,
          key: link.target.key,
          label: link.target.label,
          status: link.target.status,
        }
      : null,
  };
}

export function toNote(response: NoteResponse): Note {
  return {
    id: response.id,
    path: response.path,
    title: response.title,
    body: response.body,
    tags: response.tags,
    links: response.links.map(toLink),
    version: response.version,
    trashedAt: response.trashedAt,
    createdAt: response.createdAt,
    updatedAt: response.updatedAt,
  };
}

export function toSummary(response: NoteSummaryResponse): NoteSummary {
  return {
    id: response.id,
    path: response.path,
    title: response.title,
    tags: response.tags,
    snippet: response.snippet,
    updatedAt: response.updatedAt,
    trashedAt: response.trashedAt,
    version: response.version,
  };
}

export function toBacklink(response: BacklinkResponse): Backlink {
  return {
    noteId: response.noteId,
    path: response.path,
    title: response.title,
    context: response.context,
  };
}

export function toTagCount(response: NoteTagCountResponse): TagCount {
  return { tag: response.tag, count: response.count };
}

export function toMoved(response: NoteMovedResponse): NoteMoved {
  return {
    note: toNote(response.note),
    rewrittenNotes: response.rewrittenNotes.map((ref) => ({
      id: ref.id,
      path: ref.path,
      title: ref.title,
    })),
  };
}

export function toImportReport(response: ImportReportResponse): ImportReport {
  return {
    created: response.created,
    skipped: response.skipped,
    pendingLinks: response.pendingLinks,
    ignoredFiles: response.ignoredFiles,
    skippedFiles: response.skippedFiles,
    renamedFiles: response.renamedFiles.map((file) => ({ from: file.from, to: file.to })),
    warnings: response.warnings.map((warning) => ({
      path: warning.path,
      code: warning.code,
      message: warning.message,
    })),
  };
}

export function toLinkRequest(link: NoteLinkRef): NoteLinkInputRequest {
  return link.type === 'MONTHLY_SUMMARY'
    ? { type: link.type, key: link.key ?? null }
    : { type: link.type, id: link.id ?? null };
}

export function toCreateRequest(input: NoteInput): NoteCreateRequest {
  return {
    path: input.path,
    body: input.body,
    ...(input.links && input.links.length > 0 ? { links: input.links.map(toLinkRequest) } : {}),
  };
}
