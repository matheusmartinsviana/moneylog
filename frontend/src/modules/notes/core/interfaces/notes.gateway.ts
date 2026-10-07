import { Observable } from 'rxjs';

import type {
  Backlink,
  LinkedNotesQuery,
  Note,
  NoteInput,
  NoteLinkRef,
  NoteMoved,
  NotesQuery,
  NoteSummary,
  TagCount,
} from '~/modules/notes/core/types/note';
import type { Slice } from '~/util/api/slice';

/**
 * Porta das notas (FE 01). As implementações falham com `ProblemError` (`NOTE_NOT_FOUND`, `NOTE_PATH_TAKEN`,
 * `NOTE_TOO_LARGE`, `VERSION_CONFLICT`...). O corpo só vem de `get`: a lista nunca o devolve.
 */
export abstract class NotesGateway {
  abstract list(query: NotesQuery): Observable<Slice<NoteSummary>>;
  abstract get(id: string): Observable<Note>;
  /** `Idempotency-Key` opcional no contrato; a tela manda uma por tentativa (o retry reusa). */
  abstract create(input: NoteInput, idempotencyKey: string): Observable<Note>;
  abstract update(id: string, body: string, version: number): Observable<Note>;
  abstract move(id: string, newPath: string, version: number): Observable<NoteMoved>;
  abstract trash(id: string): Observable<Note>;
  abstract restore(id: string): Observable<Note>;
  /** Única exclusão definitiva do vault (ação explícita). */
  abstract emptyTrash(): Observable<void>;
  abstract backlinks(id: string, page: number, pageSize: number): Observable<Slice<Backlink>>;
  /** Troca **todos** os vínculos explícitos (os wikilinks do corpo não mudam). */
  abstract setLinks(id: string, links: readonly NoteLinkRef[], version: number): Observable<Note>;
  abstract linkedTo(query: LinkedNotesQuery): Observable<Slice<NoteSummary>>;
  abstract tags(): Observable<readonly TagCount[]>;
}
