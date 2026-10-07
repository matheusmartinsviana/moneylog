import { Provider } from '@angular/core';
import { Observable, of } from 'rxjs';

import { NotesGateway } from '~/modules/notes/core/interfaces/notes.gateway';
import { VaultGateway } from '~/modules/notes/core/interfaces/vault.gateway';
import type {
  Backlink,
  DownloadedFile,
  ImportConflictMode,
  ImportReport,
  LinkedNotesQuery,
  Note,
  NoteInput,
  NoteLink,
  NoteLinkRef,
  NoteMoved,
  NotesQuery,
  NoteSummary,
  TagCount,
} from '~/modules/notes/core/types/note';
import type {
  ImportReportResponse,
  NoteLinkResponse,
  NoteResponse,
  NoteSummaryResponse,
} from '~/modules/notes/infra/responses/note.response';
import type { Slice } from '~/util/api/slice';

/** Nota do cenário do plano: "Revisão de outubro" com `[[MacBook]]` e vínculo à compra do notebook. */
export function aNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    path: 'reviews/2026-10.md',
    title: '2026-10',
    body: '# Revisão de outubro\n\nComprei o [[MacBook]].',
    tags: ['revisao'],
    links: [],
    version: 3,
    trashedAt: null,
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-05T10:00:00Z',
    ...overrides,
  };
}

export function aSummary(overrides: Partial<NoteSummary> = {}): NoteSummary {
  return {
    id: 'note-1',
    path: 'reviews/2026-10.md',
    title: '2026-10',
    tags: ['revisao'],
    snippet: null,
    updatedAt: '2026-10-05T10:00:00Z',
    trashedAt: null,
    version: 3,
    ...overrides,
  };
}

export function aWikilink(overrides: Partial<NoteLink> = {}): NoteLink {
  return {
    origin: 'WIKILINK',
    type: 'NOTE',
    state: 'RESOLVED',
    text: 'MacBook',
    alias: null,
    section: null,
    embed: false,
    target: { id: 'note-2', key: null, label: 'MacBook', status: 'ACTIVE' },
    ...overrides,
  };
}

export function anExplicitLink(overrides: Partial<NoteLink> = {}): NoteLink {
  return {
    origin: 'EXPLICIT',
    type: 'TRANSACTION',
    state: 'RESOLVED',
    text: null,
    alias: null,
    section: null,
    embed: false,
    target: { id: 'tx-1', key: null, label: 'Notebook', status: 'ACTIVE' },
    ...overrides,
  };
}

export function aReport(overrides: Partial<ImportReport> = {}): ImportReport {
  return {
    created: 2,
    skipped: 1,
    pendingLinks: 1,
    ignoredFiles: ['foto.png', '.obsidian/app.json'],
    skippedFiles: ['reviews/2026-10.md'],
    renamedFiles: [{ from: 'a.md', to: 'a (2).md' }],
    warnings: [{ path: 'b.md', code: 'FRONTMATTER_INVALID', message: 'frontmatter inválido' }],
    ...overrides,
  };
}

function page<T>(items: readonly T[], p: number, size: number): Slice<T> {
  const start = (p - 1) * size;
  return { items: items.slice(start, start + size), hasNext: start + size < items.length };
}

/** Porta falsa de notas: guarda as chamadas e devolve o que o teste configurar. */
export class NotesGatewayStub extends NotesGateway {
  notes: NoteSummary[] = [];
  trashed: NoteSummary[] = [];
  backlinkItems: Backlink[] = [];
  linked: NoteSummary[] = [];
  tagList: TagCount[] = [];
  readonly queries: NotesQuery[] = [];
  readonly linkedQueries: LinkedNotesQuery[] = [];
  readonly calls: string[] = [];
  readonly createKeys: string[] = [];
  readonly creates: NoteInput[] = [];
  readonly updates: { id: string; body: string; version: number }[] = [];
  readonly linkSets: { id: string; links: readonly NoteLinkRef[]; version: number }[] = [];
  /** Resultado das escritas (`create`, `update`, `trash`, `restore`, `setLinks`). */
  next: Observable<Note> | null = null;
  moveResult: Observable<NoteMoved> | null = null;
  getResult: Observable<Note> | null = null;
  listError: Observable<never> | null = null;
  emptyResult: Observable<void> | null = null;
  backlinksResult: Observable<Slice<Backlink>> | null = null;
  linkedResult: Observable<Slice<NoteSummary>> | null = null;
  /** Fila de resultados de `update` (um por chamada); depois dela vale `next`. */
  updateQueue: Observable<Note>[] = [];
  /** Filas de resultados de `move` e `setLinks` (um por chamada). */
  moveQueue: Observable<NoteMoved>[] = [];
  setLinksQueue: Observable<Note>[] = [];
  readonly moves: { id: string; newPath: string; version: number }[] = [];

  list(query: NotesQuery): Observable<Slice<NoteSummary>> {
    this.queries.push(query);
    if (this.listError) return this.listError;
    const source = query.status === 'TRASHED' ? this.trashed : this.notes;
    const filtered = source.filter(
      (n) =>
        (!query.q || `${n.title} ${n.path}`.toLowerCase().includes(query.q.toLowerCase())) &&
        (!query.tag || n.tags.includes(query.tag)) &&
        (!query.folder || n.path.startsWith(`${query.folder}/`)),
    );
    return of(page(filtered, query.page, query.pageSize));
  }

  get(id: string): Observable<Note> {
    this.calls.push(`get:${id}`);
    return this.getResult ?? of(aNote({ id }));
  }

  create(input: NoteInput, idempotencyKey: string): Observable<Note> {
    this.createKeys.push(idempotencyKey);
    this.creates.push(input);
    this.calls.push(`create:${input.path}`);
    return (
      this.next ??
      of(aNote({ id: 'note-new', path: input.path, body: input.body, version: 0, tags: [] }))
    );
  }

  update(id: string, body: string, version: number): Observable<Note> {
    this.calls.push(`update:${id}:${version}`);
    this.updates.push({ id, body, version });
    const queued = this.updateQueue.shift();
    return queued ?? this.next ?? of(aNote({ id, body, version: version + 1 }));
  }

  move(id: string, newPath: string, version: number): Observable<NoteMoved> {
    this.calls.push(`move:${id}:${newPath}:${version}`);
    this.moves.push({ id, newPath, version });
    return (
      this.moveQueue.shift() ??
      this.moveResult ??
      of({ note: aNote({ id, path: newPath, version: version + 1 }), rewrittenNotes: [] })
    );
  }

  trash(id: string): Observable<Note> {
    this.calls.push(`trash:${id}`);
    return this.next ?? of(aNote({ id, trashedAt: '2026-10-06T10:00:00Z' }));
  }

  restore(id: string): Observable<Note> {
    this.calls.push(`restore:${id}`);
    return this.next ?? of(aNote({ id, trashedAt: null }));
  }

  emptyTrash(): Observable<void> {
    this.calls.push('emptyTrash');
    return this.emptyResult ?? of(undefined);
  }

  backlinks(id: string, p: number, size: number): Observable<Slice<Backlink>> {
    this.calls.push(`backlinks:${id}:${p}`);
    return this.backlinksResult ?? of(page(this.backlinkItems, p, size));
  }

  setLinks(id: string, links: readonly NoteLinkRef[], version: number): Observable<Note> {
    this.calls.push(`setLinks:${id}:${version}`);
    this.linkSets.push({ id, links, version });
    return this.setLinksQueue.shift() ?? this.next ?? of(aNote({ id, version: version + 1 }));
  }

  linkedTo(query: LinkedNotesQuery): Observable<Slice<NoteSummary>> {
    this.linkedQueries.push(query);
    return this.linkedResult ?? of(page(this.linked, query.page, query.pageSize));
  }

  tags(): Observable<readonly TagCount[]> {
    return of(this.tagList);
  }
}

export class VaultGatewayStub extends VaultGateway {
  readonly imports: { file: File; mode: ImportConflictMode }[] = [];
  exportResult: Observable<DownloadedFile> | null = null;
  importResult: Observable<ImportReport> | null = null;
  exports = 0;

  export(): Observable<DownloadedFile> {
    this.exports++;
    return (
      this.exportResult ??
      of({
        blob: new Blob(['zip'], { type: 'application/zip' }),
        filename: 'moneylog-vault-2026-10-05.zip',
      })
    );
  }

  import(file: File, mode: ImportConflictMode): Observable<ImportReport> {
    this.imports.push({ file, mode });
    return this.importResult ?? of(aReport());
  }
}

export function provideNotesStub(
  notes: NotesGatewayStub = new NotesGatewayStub(),
  vault: VaultGatewayStub = new VaultGatewayStub(),
): Provider[] {
  return [
    { provide: NotesGateway, useValue: notes },
    { provide: VaultGateway, useValue: vault },
  ];
}

/** Respostas cruas da API (como `schema.gen.ts`), para os testes da infra. */
export function aLinkResponse(overrides: Partial<NoteLinkResponse> = {}): NoteLinkResponse {
  return {
    origin: 'WIKILINK',
    type: 'NOTE',
    state: 'RESOLVED',
    text: 'MacBook',
    alias: null,
    section: null,
    embed: false,
    target: { id: 'note-2', key: null, label: 'MacBook', status: 'ACTIVE' },
    ...overrides,
  };
}

export function aNoteResponse(overrides: Partial<NoteResponse> = {}): NoteResponse {
  return {
    id: 'note-1',
    path: 'reviews/2026-10.md',
    title: '2026-10',
    body: '# Revisão de outubro\n\nComprei o [[MacBook]].',
    tags: ['revisao'],
    links: [aLinkResponse()],
    version: 3,
    trashedAt: null,
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-05T10:00:00Z',
    ...overrides,
  };
}

export function aSummaryResponse(
  overrides: Partial<NoteSummaryResponse> = {},
): NoteSummaryResponse {
  return {
    id: 'note-1',
    path: 'reviews/2026-10.md',
    title: '2026-10',
    tags: ['revisao'],
    snippet: null,
    updatedAt: '2026-10-05T10:00:00Z',
    trashedAt: null,
    version: 3,
    ...overrides,
  };
}

export function aReportResponse(
  overrides: Partial<ImportReportResponse> = {},
): ImportReportResponse {
  return {
    created: 2,
    skipped: 1,
    pendingLinks: 1,
    ignoredFiles: ['foto.png'],
    skippedFiles: ['a.md'],
    renamedFiles: [{ from: 'b.md', to: 'b (2).md' }],
    warnings: [{ path: 'c.md', code: 'FRONTMATTER_INVALID', message: 'x' }],
    ...overrides,
  };
}
