import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  catchError,
  EMPTY,
  exhaustMap,
  expand,
  map,
  Observable,
  of,
  reduce,
  startWith,
  Subject,
  switchMap,
  tap,
} from 'rxjs';

import { NotesGateway } from '~/modules/notes/core/interfaces/notes.gateway';
import type { Backlink, Note, NoteLinkRef, NoteMoved } from '~/modules/notes/core/types/note';
import {
  applyLinkChange,
  explicitRefs,
  type LinkChange,
} from '~/modules/notes/core/types/note-link-refs';
import { Problem, problemOf } from '~/util/api/problem';
import { MAX_PAGE_SIZE } from '~/util/api/slice';

export type NoteLoadState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly note: Note };

export type BacklinksState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly items: readonly Backlink[] };

export type NoteWrite =
  | { readonly kind: 'save'; readonly body: string; readonly version?: number }
  | { readonly kind: 'move'; readonly newPath: string }
  | { readonly kind: 'trash' }
  | { readonly kind: 'restore' }
  | {
      readonly kind: 'links';
      readonly links: readonly NoteLinkRef[];
      /** A intenção do usuário (vincular/desvincular), para refazer sobre a versão mais nova. */
      readonly change?: LinkChange;
    };
type Write = NoteWrite;

/** Quantas vezes seguidas a facade refaz sozinha uma ação (renomear/vincular) depois de um conflito. */
const MAX_AUTO_REDO = 2;

/**
 * O que mudou em outro lugar: a versão do servidor, para o usuário decidir (nunca sobrescreve sozinho).
 * `during` diz qual ação deu o conflito; `redo` é a ação a refazer sobre a versão nova (`move`/`links`).
 */
export interface NoteConflict {
  readonly remote: Note;
  readonly during: Write['kind'];
  readonly redo: Write | null;
}

const BACKLINKS_MAX_PAGES = 4;

/**
 * Facade do editor de uma nota. Salvar manda `version`; **`VERSION_CONFLICT` nunca sobrescreve o que foi
 * digitado**: o texto local continua no editor, a versão do servidor é carregada em `conflict` e o usuário
 * escolhe (`saveOverConflict`, que reenvia o texto dele com a versão nova; ou `acceptRemote`, que o troca pelo
 * do servidor). Uma escrita por vez (`exhaustMap`); a nota da resposta é o estado. `baseline` é o último texto
 * confirmado pelo backend: `dirty` é "o digitado difere dele" (feito pela tela). Escopo de componente.
 */
@Injectable()
export class NoteEditorFacade {
  private readonly gateway = inject(NotesGateway);
  private readonly destroyRef = inject(DestroyRef);
  private readonly loads = new Subject<string>();
  private readonly writes = new Subject<Write>();
  private readonly backlinkLoads = new Subject<string>();

  private readonly loadState = signal<NoteLoadState>({ status: 'idle' });
  private readonly noteState = signal<Note | null>(null);
  private readonly baselineState = signal('');
  private readonly savingState = signal(false);
  private readonly writingState = signal(false);
  private readonly problemState = signal<Problem | null>(null);
  private readonly conflictState = signal<NoteConflict | null>(null);
  private readonly backlinksState = signal<BacklinksState>({ status: 'loading' });
  private autoRedos = 0;

  private readonly savedEvents = new Subject<{ readonly note: Note; readonly sentBody: string }>();
  private readonly replacedEvents = new Subject<Note>();
  private readonly movedEvents = new Subject<NoteMoved>();
  private readonly trashedEvents = new Subject<Note>();
  private readonly restoredEvents = new Subject<Note>();
  private readonly linksEvents = new Subject<Note>();

  readonly loadStatus = this.loadState.asReadonly();
  /** A nota confirmada pelo backend; durante uma recarga continua a anterior. */
  readonly note = this.noteState.asReadonly();
  readonly baseline = this.baselineState.asReadonly();
  /** Salvando o texto (para o rótulo "Salvando..."). */
  readonly saving = this.savingState.asReadonly();
  /** Qualquer escrita em curso (salvar, mover, lixeira, vínculos). */
  readonly busy = this.writingState.asReadonly();
  readonly problem = this.problemState.asReadonly();
  readonly conflict = this.conflictState.asReadonly();
  readonly backlinks = this.backlinksState.asReadonly();
  readonly trashed = computed(() => this.noteState()?.trashedAt != null);

  /** O texto da resposta foi gravado (`sentBody` é o que foi enviado). */
  readonly saved$ = this.savedEvents.asObservable();
  /** A nota foi trocada pela do servidor (conflito aceito, lixeira, restaurar): a tela reinicia o texto. */
  readonly replaced$ = this.replacedEvents.asObservable();
  readonly moved$ = this.movedEvents.asObservable();
  readonly trashed$ = this.trashedEvents.asObservable();
  readonly restored$ = this.restoredEvents.asObservable();
  readonly links$ = this.linksEvents.asObservable();

  constructor() {
    this.loads
      .pipe(
        switchMap((id) =>
          this.gateway.get(id).pipe(
            map((note): NoteLoadState => ({ status: 'ready', note })),
            startWith<NoteLoadState>({ status: 'loading' }),
            catchError((error: unknown) =>
              of<NoteLoadState>({ status: 'error', problem: problemOf(error) }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => {
        this.loadState.set(state);
        if (state.status === 'ready') {
          this.noteState.set(state.note);
          this.baselineState.set(state.note.body);
          this.conflictState.set(null);
        } else if (state.status === 'error') {
          this.noteState.set(null);
        }
      });

    this.writes
      .pipe(
        exhaustMap((write) => {
          this.writingState.set(true);
          this.savingState.set(write.kind === 'save');
          this.problemState.set(null);
          return this.send(write).pipe(
            tap((result) => this.apply(write, result)),
            map(() => null),
            catchError((error: unknown) => {
              const problem = problemOf(error);
              if (problem.code === 'VERSION_CONFLICT') return this.fetchConflict(write, problem);
              return of(problem);
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((problem) => {
        this.writingState.set(false);
        this.savingState.set(false);
        this.problemState.set(problem);
      });

    this.backlinkLoads
      .pipe(
        switchMap((id) => this.loadAllBacklinks(id)),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.backlinksState.set(state));
  }

  load(id: string): void {
    this.loads.next(id);
    this.backlinkLoads.next(id);
  }

  /**
   * Atualiza só a nota confirmada (vínculos e versão) a partir do servidor, **sem tocar** no texto digitado nem
   * no baseline: usado depois de criar o alvo de um link pendente (o backend o resolve) ou de trocar vínculos.
   */
  refresh(): void {
    const note = this.noteState();
    if (!note) return;
    this.gateway
      .get(note.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (fresh) => {
          this.noteState.update((current) =>
            current && current.id === fresh.id ? fresh : current,
          );
          this.reloadBacklinks();
        },
        error: () => undefined,
      });
  }

  reloadBacklinks(): void {
    const note = this.noteState();
    if (note) this.backlinkLoads.next(note.id);
  }

  save(body: string): void {
    this.writes.next({ kind: 'save', body });
  }

  /** O usuário escolheu manter o texto dele: reenvia com a versão do servidor. */
  saveOverConflict(body: string): void {
    const conflict = this.conflictState();
    if (!conflict) return;
    this.writes.next({ kind: 'save', body, version: conflict.remote.version });
  }

  /** O usuário escolheu o texto do servidor: troca a nota e o texto local (perde o digitado, por escolha). */
  acceptRemote(): void {
    const conflict = this.conflictState();
    if (!conflict) return;
    this.conflictState.set(null);
    this.adopt(conflict.remote);
    this.replacedEvents.next(conflict.remote);
  }

  /**
   * Conflito vindo de `move`/`links` com o rascunho **limpo** (o usuário não digitou nada): nada a perder.
   * Adota a versão do servidor e **refaz a ação pedida** sobre ela (renomear: o mesmo caminho; vincular: a
   * mesma mudança sobre os vínculos novos). Devolve `false` se não há o que refazer ou se já refez demais.
   */
  adoptRemoteAndRedo(): boolean {
    const conflict = this.conflictState();
    const redo = conflict?.redo;
    if (!conflict || !redo || this.autoRedos >= MAX_AUTO_REDO) return false;
    this.autoRedos += 1;
    this.conflictState.set(null);
    this.adopt(conflict.remote);
    this.replacedEvents.next(conflict.remote);
    if (redo.kind === 'links' && redo.change) {
      this.writes.next({
        kind: 'links',
        links: applyLinkChange(explicitRefs(conflict.remote.links), redo.change),
        change: redo.change,
      });
    } else {
      this.writes.next(redo);
    }
    return true;
  }

  move(newPath: string): void {
    this.writes.next({ kind: 'move', newPath });
  }

  trash(): void {
    this.writes.next({ kind: 'trash' });
  }

  restore(): void {
    this.writes.next({ kind: 'restore' });
  }

  setLinks(links: readonly NoteLinkRef[], change?: LinkChange): void {
    this.writes.next({ kind: 'links', links, change });
  }

  dismissProblem(): void {
    this.problemState.set(null);
  }

  private adopt(note: Note): void {
    this.noteState.set(note);
    this.baselineState.set(note.body);
  }

  private send(write: Write): Observable<Note | NoteMoved> {
    const note = this.noteState();
    if (!note) return EMPTY;
    switch (write.kind) {
      case 'save':
        return this.gateway.update(note.id, write.body, write.version ?? note.version);
      case 'move':
        return this.gateway.move(note.id, write.newPath, note.version);
      case 'trash':
        return this.gateway.trash(note.id);
      case 'restore':
        return this.gateway.restore(note.id);
      case 'links':
        return this.gateway.setLinks(note.id, write.links, note.version);
    }
  }

  private apply(write: Write, result: Note | NoteMoved): void {
    this.conflictState.set(null);
    this.autoRedos = 0;
    switch (write.kind) {
      case 'save': {
        const note = result as Note;
        this.noteState.set(note);
        this.baselineState.set(write.body);
        this.savedEvents.next({ note, sentBody: write.body });
        this.reloadBacklinks();
        break;
      }
      case 'move': {
        const moved = result as NoteMoved;
        this.adopt(moved.note);
        this.movedEvents.next(moved);
        this.reloadBacklinks();
        break;
      }
      case 'trash': {
        const note = result as Note;
        this.adopt(note);
        this.trashedEvents.next(note);
        this.reloadBacklinks();
        break;
      }
      case 'restore': {
        const note = result as Note;
        this.adopt(note);
        this.restoredEvents.next(note);
        this.reloadBacklinks();
        break;
      }
      case 'links': {
        const note = result as Note;
        this.noteState.set(note);
        this.linksEvents.next(note);
        break;
      }
    }
  }

  /** `VERSION_CONFLICT`: carrega a versão do servidor para o usuário decidir; o texto local não é tocado. */
  private fetchConflict(write: Write, problem: Problem): Observable<Problem | null> {
    const note = this.noteState();
    if (!note) return of(problem);
    return this.gateway.get(note.id).pipe(
      map((remote): Problem | null => {
        // Resposta perdida: o servidor já tem exatamente o texto enviado. Não há o que decidir.
        if (write.kind === 'save' && remote.body === write.body) {
          this.apply(write, remote);
          return null;
        }
        const redo = write.kind === 'move' || write.kind === 'links' ? write : null;
        this.conflictState.set({ remote, during: write.kind, redo });
        return problem;
      }),
      catchError(() => of(problem)),
    );
  }

  private loadAllBacklinks(id: string): Observable<BacklinksState> {
    const page = (n: number) => this.gateway.backlinks(id, n, MAX_PAGE_SIZE);
    return page(1).pipe(
      expand((slice, index) =>
        slice.hasNext && index + 1 < BACKLINKS_MAX_PAGES ? page(index + 2) : EMPTY,
      ),
      reduce(
        (all: readonly Backlink[], slice) => [...all, ...slice.items],
        [] as readonly Backlink[],
      ),
      map((items): BacklinksState => ({ status: 'ready', items })),
      startWith<BacklinksState>({ status: 'loading' }),
      catchError((error: unknown) =>
        of<BacklinksState>({ status: 'error', problem: problemOf(error) }),
      ),
    );
  }
}
