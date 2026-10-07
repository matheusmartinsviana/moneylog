import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';

import { ChipComponent } from '~/app/common/components/chip/chip.component';
import { ConfirmDialogComponent } from '~/app/common/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '~/app/common/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import { MenuComponent, type MenuItem } from '~/app/common/components/menu/menu.component';
import { ViewportService } from '~/app/common/components/overlay/viewport.service';
import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { TabPanelDirective } from '~/app/common/components/tabs/tab-panel.directive';
import { type TabItem, TabsComponent } from '~/app/common/components/tabs/tabs.component';
import { valueSignal } from '~/app/common/forms/control-signal';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { DisplayTextPipe } from '~/app/common/pipes/display-text.pipe';
import { ToastService } from '~/app/common/services/toast.service';
import { ConflictPanelComponent } from '~/app/features/notes/components/conflict-panel/conflict-panel.component';
import { LinkPickerSheetComponent } from '~/app/features/notes/components/link-picker-sheet/link-picker-sheet.component';
import { MarkdownEditorComponent } from '~/app/features/notes/components/markdown-editor/markdown-editor.component';
import { MarkdownViewComponent } from '~/app/features/notes/components/markdown-view/markdown-view.component';
import { MoveNoteSheetComponent } from '~/app/features/notes/components/move-note-sheet/move-note-sheet.component';
import { NewNoteSheetComponent } from '~/app/features/notes/components/new-note-sheet/new-note-sheet.component';
import { NoteLinksPanelComponent } from '~/app/features/notes/components/note-links-panel/note-links-panel.component';
import { NoteDraftStore } from '~/app/features/notes/services/note-draft.store';
import { NoteEditorFacade } from '~/modules/notes/core/facades/note-editor.facade';
import type { Note, NoteLink, NoteLinkRef, NoteRef } from '~/modules/notes/core/types/note';
import {
  applyLinkChange,
  explicitRefs,
  refOfLink,
} from '~/modules/notes/core/types/note-link-refs';
import { isTooLarge, noteFolder, noteName } from '~/modules/notes/core/types/note-path';
import { formatInstant } from '~/util/date';
import { displayText } from '~/util/display-text';

/** Debounce da pré-visualização (T116 CA1). */
export const PREVIEW_DEBOUNCE_MS = 300;
/** Debounce do rascunho local (a perda de aba é rara; o `visibilitychange` grava na hora). */
export const DRAFT_DEBOUNCE_MS = 500;

/** CRLF/CR viram LF (o `<textarea>` faz o mesmo ao digitar). */
function normalizeEol(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/**
 * Nota (smart): editor de Markdown com pré-visualização segura lado a lado (desktop) ou em abas
 * "Escrever/Ler" (celular). Salvar manda a `version`; `VERSION_CONFLICT` **nunca** sobrescreve o digitado (o
 * painel de conflito oferece as duas escolhas). Alterações não salvas pedem confirmação ao sair (rota e aba do
 * navegador). Renomear mostra quantas notas tiveram links reescritos; mandar para a lixeira é reversível. O
 * texto é dado: o backend não o renderiza e o front o desenha sem HTML. Fala só com a facade (FE 01).
 */
@Component({
  selector: 'app-note-page',
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    RouterLink,
    PageLayoutComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    ConfirmDialogComponent,
    MenuComponent,
    TabsComponent,
    TabPanelDirective,
    ChipComponent,
    MarkdownEditorComponent,
    MarkdownViewComponent,
    ConflictPanelComponent,
    MoveNoteSheetComponent,
    NewNoteSheetComponent,
    NoteLinksPanelComponent,
    LinkPickerSheetComponent,
    DisplayTextPipe,
  ],
  providers: [NoteEditorFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown)': 'onKeydown($event)' },
  templateUrl: './note.page.html',
  styleUrl: './note.page.css',
})
export class NotePage {
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly drafts = inject(NoteDraftStore);
  private readonly i18n = inject(I18nService);
  protected readonly viewport = inject(ViewportService);
  protected readonly t = this.i18n.t;
  protected readonly facade = inject(NoteEditorFacade);

  /** `:id` da rota. */
  readonly id = input.required<string>();

  protected readonly note = this.facade.note;
  protected readonly loadStatus = this.facade.loadStatus;
  /** O título vindo do front matter pode trazer RLO/controle: aparece com marcas visíveis (F7). */
  protected readonly heading = computed(() => {
    const title = this.note()?.title;
    return title ? displayText(title) : this.t().nav.notes;
  });
  protected readonly trashed = this.facade.trashed;
  protected readonly conflict = this.facade.conflict;
  /**
   * "Salvar o meu texto por cima" só existe quando há texto digitado (ou o conflito veio de um salvar). Com o
   * rascunho limpo e a ação sendo renomear/vincular, o texto "meu" é só o antigo: sobrescrevê-lo apagaria a
   * edição feita em outro lugar sem o usuário ter digitado nada.
   */
  protected readonly canKeepMine = computed(() => {
    const conflict = this.conflict();
    return conflict !== null && (conflict.during === 'save' || this.dirty());
  });
  protected readonly notFound = computed(() => {
    const state = this.loadStatus();
    return state.status === 'error' && state.problem.status === 404;
  });
  protected readonly loadProblem = computed(() => {
    const state = this.loadStatus();
    return state.status === 'error' ? state.problem : null;
  });

  /** O texto do editor (o que o usuário digitou). */
  protected readonly text = new FormControl('', { nonNullable: true });
  protected readonly draft = valueSignal(this.text);
  protected readonly previewText = signal('');
  protected readonly mode = signal<string | null>('write');

  /** Rascunho local restaurado ao abrir (aba recarregada/descartada): o aviso com "Descartar". */
  protected readonly draftRecovered = signal(false);
  protected readonly dirty = computed(
    () =>
      this.note() !== null &&
      !this.trashed() &&
      // O `<textarea>` normaliza CRLF para LF: um zip do Windows não pode deixar a nota "suja" sem edição.
      normalizeEol(this.draft()) !== normalizeEol(this.facade.baseline()),
  );
  protected readonly tooLarge = computed(() => isTooLarge(this.draft()));
  protected readonly canSave = computed(
    () => this.dirty() && !this.facade.busy() && !this.tooLarge() && this.conflict() === null,
  );

  protected readonly statusText = computed(() => {
    const copy = this.t().notes.editor;
    if (this.facade.saving()) return copy.saving;
    return this.dirty() ? copy.unsaved : copy.saved;
  });
  protected readonly modeTabs = computed<readonly TabItem[]>(() => [
    { id: 'write', label: this.t().notes.editor.write },
    { id: 'read', label: this.t().notes.editor.read },
  ]);
  protected readonly menuItems = computed<readonly MenuItem[]>(() => {
    const copy = this.t().notes.editor;
    return [
      { id: 'rename', label: copy.rename, disabled: this.trashed() },
      { id: 'trash', label: copy.moveToTrash, destructive: true, disabled: this.trashed() },
    ];
  });
  protected readonly updated = computed(() => {
    const note = this.note();
    return note
      ? interpolate(this.t().notes.editor.updated, {
          date: formatInstant(note.updatedAt, HTML_LANG[this.i18n.language()]),
        })
      : '';
  });
  protected readonly problemText = computed(() => {
    const problem = this.facade.problem();
    // As folhas abertas (renomear, vincular) mostram o próprio erro.
    if (!problem || this.pickerOpen() || this.moveOpen()) return null;
    // O conflito tem painel próprio; o resto vira um aviso com o motivo.
    if (problem.code === 'VERSION_CONFLICT') {
      return this.conflict() === null ? this.t().notes.editor.conflict.remoteLoadFailed : null;
    }
    return problemMessage(problem, this.t().errors);
  });
  protected readonly moveProblem = computed(() => (this.moveOpen() ? this.facade.problem() : null));

  // Estado de UI.
  protected readonly moveOpen = signal(false);
  protected readonly confirmingTrash = signal(false);
  protected readonly leaving = signal(false);
  protected readonly lastMove = signal<readonly NoteRef[] | null>(null);
  protected readonly createFromLink = signal<string | null>(null);
  protected readonly pickerOpen = signal(false);

  /** Os vínculos explícitos que o backend resolveu: o que se reenvia ao trocar os vínculos. */
  protected readonly explicitRefs = computed<readonly NoteLinkRef[]>(() =>
    explicitRefs(this.note()?.links ?? []),
  );
  protected readonly pickerProblem = computed(() =>
    this.pickerOpen() ? this.facade.problem() : null,
  );

  private readonly editor = viewChild(MarkdownEditorComponent);
  private leaveResolver: ((leave: boolean) => void) | null = null;

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => {
        this.lastMove.set(null);
        this.facade.load(id);
      });
    });
    // Nota carregada (ou recarregada): o editor e a pré-visualização partem do texto do backend.
    effect(() => {
      const state = this.loadStatus();
      if (state.status !== 'ready') return;
      untracked(() => {
        this.reset(state.note.body);
        this.recoverDraft(state.note);
      });
    });
    // Conflito de renomear/vincular com o rascunho limpo: nada digitado a perder. Adota a versão do servidor
    // e refaz a ação pedida (nunca oferece sobrescrever o que outra aba gravou).
    effect(() => {
      const conflict = this.conflict();
      if (!conflict || this.dirty()) return;
      if (conflict.during === 'move' || conflict.during === 'links') {
        untracked(() => this.facade.adoptRemoteAndRedo());
      }
    });
    // A pré-visualização acompanha o texto com debounce.
    this.text.valueChanges
      .pipe(debounceTime(PREVIEW_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe((value) => this.previewText.set(value));

    // Rascunho local: grava com debounce enquanto há alterações e limpa quando não há mais.
    this.text.valueChanges
      .pipe(debounceTime(DRAFT_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe(() => this.persistDraft());

    this.facade.replaced$.pipe(takeUntilDestroyed()).subscribe((note) => {
      this.reset(note.body);
      this.drafts.clear(note.id);
      this.draftRecovered.set(false);
    });
    this.facade.saved$.pipe(takeUntilDestroyed()).subscribe(({ note }) => {
      this.drafts.clear(note.id);
      this.draftRecovered.set(false);
      this.toast.show(this.t().notes.editor.savedToast);
      // O destino de um `[[link]]` recém-escrito pode ter sido resolvido: o backend devolve o estado.
      this.previewText.set(this.text.value);
    });
    this.facade.trashed$.pipe(takeUntilDestroyed()).subscribe((note) => {
      this.confirmingTrash.set(false);
      this.reset(note.body);
      this.toast.show(this.t().notes.editor.trashedToast);
    });
    this.facade.restored$.pipe(takeUntilDestroyed()).subscribe((note) => {
      this.reset(note.body);
      this.toast.show(this.t().notes.editor.restoredToast);
    });
    this.facade.links$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.pickerOpen.set(false);
      this.toast.show(this.t().notes.links.saved);
    });
    this.facade.moved$.pipe(takeUntilDestroyed()).subscribe((moved) => {
      this.moveOpen.set(false);
      this.lastMove.set(moved.rewrittenNotes);
      this.toast.show(this.t().notes.editor.move.moved);
    });

    // Aba do navegador: avisa de alterações não salvas (o roteador cuida das rotas, `canDeactivate`).
    const view = inject(DestroyRef);
    const handler = (event: BeforeUnloadEvent) => {
      if (!this.dirty()) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    // iOS: a aba pode ser morta ao ir para segundo plano; grava o rascunho na hora.
    const hidden = () => {
      if (document.visibilityState === 'hidden') this.persistDraft();
    };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', hidden);
    view.onDestroy(() => {
      window.removeEventListener('beforeunload', handler);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', hidden);
    });
  }

  private persistDraft(): void {
    const note = this.note();
    if (!note) return;
    if (this.dirty()) this.drafts.save(note.id, { body: this.draft(), version: note.version });
    else this.drafts.clear(note.id);
  }

  /** Só restaura sobre a **mesma versão** (senão salvar sobrescreveria a edição de outra aba). */
  private recoverDraft(note: Note): void {
    const draft = this.drafts.get(note.id);
    if (!draft || note.trashedAt != null) return;
    if (draft.version !== note.version || normalizeEol(draft.body) === normalizeEol(note.body)) {
      this.drafts.clear(note.id);
      return;
    }
    this.text.setValue(draft.body);
    this.previewText.set(draft.body);
    this.draftRecovered.set(true);
  }

  protected discardDraft(): void {
    const note = this.note();
    if (note) this.drafts.clear(note.id);
    this.draftRecovered.set(false);
    this.reset(this.facade.baseline());
  }

  private reset(body: string): void {
    this.text.setValue(body);
    this.previewText.set(body);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      this.save();
    }
  }

  protected save(): void {
    if (this.canSave()) this.facade.save(this.draft());
  }

  protected keepMine(): void {
    this.facade.saveOverConflict(this.draft());
  }

  protected onMenu(id: string): void {
    if (id === 'rename') {
      this.facade.dismissProblem();
      this.moveOpen.set(true);
    } else if (id === 'trash') {
      this.facade.dismissProblem();
      this.confirmingTrash.set(true);
    }
  }

  protected openPicker(): void {
    this.facade.dismissProblem();
    this.pickerOpen.set(true);
  }

  protected closePicker(): void {
    this.pickerOpen.set(false);
    this.facade.dismissProblem();
  }

  protected addLink(ref: NoteLinkRef): void {
    this.facade.setLinks(applyLinkChange(this.explicitRefs(), { add: ref }), { add: ref });
  }

  /** Remove um vínculo explícito: reenvia os outros (os vínculos pendentes de importação saem junto, dito na tela). */
  protected removeLink(link: NoteLink): void {
    const ref = refOfLink(link);
    this.facade.setLinks(applyLinkChange(this.explicitRefs(), { remove: ref }), { remove: ref });
  }

  protected closeMove(): void {
    this.moveOpen.set(false);
    this.facade.dismissProblem();
  }

  protected cancelTrash(): void {
    if (!this.facade.busy()) this.confirmingTrash.set(false);
  }

  protected retry(): void {
    this.facade.load(this.id());
  }

  protected readonly noteName = noteName;
  protected readonly noteFolder = noteFolder;

  protected countText(count: number): string {
    return interpolate(this.t().notes.editor.move.rewrittenMany, { count: String(count) });
  }

  /** Para o link pendente do texto: abre a folha com o nome (e a pasta) do alvo preenchidos. */
  protected askCreate(target: string): void {
    this.createFromLink.set(target);
  }

  protected createdFromLink(): void {
    this.createFromLink.set(null);
    this.facade.refresh();
  }

  /**
   * `canDeactivate`: sem alterações segue; com alterações abre o `ConfirmDialog` "Sair sem salvar?" e espera a
   * resposta. Chamado só pela rota.
   */
  confirmLeave(): Promise<boolean> {
    if (!this.dirty()) return Promise.resolve(true);
    // Uma segunda navegação enquanto o diálogo está aberto: a primeira promessa não pode ficar pendente.
    this.leaveResolver?.(false);
    this.leaving.set(true);
    return new Promise<boolean>((resolve) => {
      this.leaveResolver = resolve;
    });
  }

  protected answerLeave(leave: boolean): void {
    // Sair sem salvar é uma escolha: o rascunho local não volta como surpresa depois.
    const note = this.note();
    if (leave && note) this.drafts.clear(note.id);
    this.leaving.set(false);
    this.leaveResolver?.(leave);
    this.leaveResolver = null;
  }

  protected openNotes(): void {
    void this.router.navigate(['/notes']);
  }

  /** Foca o texto (útil depois de criar a nota). */
  focusEditor(): void {
    this.editor()?.focus();
  }
}
