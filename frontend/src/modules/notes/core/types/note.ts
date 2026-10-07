/** Tipos do vault de notas (Etapa 6). Espelham o contrato `Notes`/`Vault`; o front nunca altera valores financeiros. */

export const NOTE_LINK_TYPES = [
  'TRANSACTION',
  'ACCOUNT',
  'CARD',
  'INVOICE',
  'PERSON',
  'DEBT',
  'GOAL',
  'MONTHLY_SUMMARY',
  'NOTE',
] as const;
export type NoteLinkType = (typeof NOTE_LINK_TYPES)[number];

export type NoteStatusFilter = 'ACTIVE' | 'TRASHED';
export type NoteSort = 'RELEVANCE' | 'UPDATED' | 'PATH' | 'TITLE';
export type NoteLinkOrigin = 'WIKILINK' | 'EXPLICIT';
export type NoteLinkState = 'RESOLVED' | 'PENDING';
/** Estado do alvo de um vínculo (S-164: o vínculo nunca some). */
export type NoteTargetStatus = 'ACTIVE' | 'VOIDED' | 'ARCHIVED' | 'CANCELED' | 'TRASHED';
export type ImportConflictMode = 'SKIP' | 'RENAME';

/** Limites do contrato (S-162). */
export const MAX_NOTE_BYTES = 200 * 1024;
export const MAX_PATH_LENGTH = 255;
export const MAX_SEARCH_LENGTH = 200;
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

export interface NoteSummary {
  readonly id: string;
  readonly path: string;
  readonly title: string;
  readonly tags: readonly string[];
  /** Trecho de texto puro (nunca HTML) com o termo buscado; `null` sem busca. */
  readonly snippet: string | null;
  readonly updatedAt: string;
  readonly trashedAt: string | null;
  readonly version: number;
}

export interface NoteLinkTarget {
  readonly id: string | null;
  /** `AAAA-MM` no resumo mensal. */
  readonly key: string | null;
  readonly label: string | null;
  readonly status: NoteTargetStatus | null;
}

export interface NoteLink {
  readonly origin: NoteLinkOrigin;
  readonly type: NoteLinkType;
  readonly state: NoteLinkState;
  /** Alvo como escrito no wikilink (ou valor original de um vínculo pendente). */
  readonly text: string | null;
  readonly alias: string | null;
  readonly section: string | null;
  readonly embed: boolean;
  readonly target: NoteLinkTarget | null;
}

export interface Note {
  readonly id: string;
  readonly path: string;
  readonly title: string;
  /** Markdown como o usuário escreveu: é **dado**, nunca HTML. */
  readonly body: string;
  readonly tags: readonly string[];
  readonly links: readonly NoteLink[];
  readonly version: number;
  readonly trashedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Vínculo explícito enviado ao backend: `id` para entidades e notas, `key` (`AAAA-MM`) para o resumo mensal. */
export interface NoteLinkRef {
  readonly type: NoteLinkType;
  readonly id?: string;
  readonly key?: string;
}

export interface NoteInput {
  readonly path: string;
  readonly body: string;
  readonly links?: readonly NoteLinkRef[];
}

export interface Backlink {
  readonly noteId: string;
  readonly path: string;
  readonly title: string;
  readonly context: string | null;
}

export interface TagCount {
  readonly tag: string;
  readonly count: number;
}

export interface NoteRef {
  readonly id: string;
  readonly path: string;
  readonly title: string;
}

export interface NoteMoved {
  readonly note: Note;
  /** As outras notas cujo texto foi reescrito (wikilinks que apontavam para a movida). */
  readonly rewrittenNotes: readonly NoteRef[];
}

export interface NotesQuery {
  readonly q?: string;
  readonly tag?: string;
  readonly folder?: string;
  readonly status?: NoteStatusFilter;
  readonly sort?: NoteSort;
  readonly page: number;
  readonly pageSize: number;
}

export interface LinkedNotesQuery {
  readonly type: NoteLinkType;
  /** `id` da entidade, ou `key` (`AAAA-MM`) no resumo mensal. */
  readonly id?: string;
  readonly key?: string;
  readonly page: number;
  readonly pageSize: number;
}

export interface ImportRenamedFile {
  readonly from: string;
  readonly to: string;
}

export interface ImportWarning {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface ImportReport {
  readonly created: number;
  readonly skipped: number;
  readonly pendingLinks: number;
  readonly ignoredFiles: readonly string[];
  readonly skippedFiles: readonly string[];
  readonly renamedFiles: readonly ImportRenamedFile[];
  readonly warnings: readonly ImportWarning[];
}

export interface DownloadedFile {
  readonly blob: Blob;
  readonly filename: string;
}

/** Alvo de um vínculo vindo de uma tela financeira (a página informa; o módulo não importa os outros). */
export interface LinkTarget {
  readonly type: NoteLinkType;
  readonly id?: string;
  readonly key?: string;
  /** Nome para sugerir o título da nota nova ("Nota de ..."). */
  readonly label: string;
}
