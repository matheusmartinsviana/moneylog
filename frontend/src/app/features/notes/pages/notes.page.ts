import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ConfirmDialogComponent } from '~/app/common/components/confirm-dialog/confirm-dialog.component';
import { DisclosureComponent } from '~/app/common/components/disclosure/disclosure.component';
import {
  EmptyStateAction,
  EmptyStateComponent,
} from '~/app/common/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { SelectComponent } from '~/app/common/components/forms/select/select.component';
import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { IconComponent } from '~/app/common/components/icon/icon.component';
import { LiveAnnouncer } from '~/app/common/components/overlay/live-announcer.service';
import { ViewportService } from '~/app/common/components/overlay/viewport.service';
import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { SlideIndicatorDirective } from '~/app/common/motion/slide-indicator.directive';
import { ToastService } from '~/app/common/services/toast.service';
import { FolderTreeComponent } from '~/app/features/notes/components/folder-tree/folder-tree.component';
import { NewNoteSheetComponent } from '~/app/features/notes/components/new-note-sheet/new-note-sheet.component';
import { NoteRowComponent } from '~/app/features/notes/components/note-row/note-row.component';
import { TagChipsComponent } from '~/app/features/notes/components/tag-chips/tag-chips.component';
import { TrashListComponent } from '~/app/features/notes/components/trash-list/trash-list.component';
import { VaultSectionComponent } from '~/app/features/notes/components/vault-section/vault-section.component';
import { NotesListFacade } from '~/modules/notes/core/facades/notes-list.facade';
import type { Note } from '~/modules/notes/core/types/note';
import {
  filtersFromQuery,
  filtersToQuery,
  NO_FILTERS,
} from '~/modules/notes/core/types/note-filters';
import type { FolderNode } from '~/modules/notes/core/types/note-path';

/** Opções da pasta no celular: a árvore achatada, com o recuo no rótulo (a árvore vira lista com seletor). */
function folderOptions(root: FolderNode): readonly ChoiceOption[] {
  const out: ChoiceOption[] = [];
  const walk = (nodes: readonly FolderNode[], depth: number) => {
    for (const node of nodes) {
      out.push({
        value: node.path,
        label: `${'  '.repeat(depth)}${node.name}`,
        hint: String(node.count),
      });
      walk(node.children, depth + 1);
    }
  };
  walk(root.children, 0);
  return out;
}

/**
 * Notas (smart): árvore de pastas (derivada dos caminhos), lista com busca (debounce de 300 ms, o termo vai
 * para a URL), filtro por tag, lixeira com restaurar e esvaziar (confirmação explícita) e o estado vazio do
 * DS 01. 375 px: a árvore vira um seletor de pasta; 1280 px: painel lateral. O vault mora no servidor, e a
 * tela diz isso com honestidade (S-157). Fala só com facades de negócio (FE 01).
 */
@Component({
  selector: 'app-notes-page',
  imports: [
    SlideIndicatorDirective,
    ReactiveFormsModule,
    RouterLink,
    PageLayoutComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    ConfirmDialogComponent,
    TextFieldComponent,
    IconComponent,
    SelectComponent,
    FolderTreeComponent,
    NoteRowComponent,
    TagChipsComponent,
    TrashListComponent,
    NewNoteSheetComponent,
    DisclosureComponent,
    VaultSectionComponent,
  ],
  providers: [NotesListFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notes.page.html',
  styleUrl: './notes.page.css',
})
export class NotesPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly announcer = inject(LiveAnnouncer);
  protected readonly viewport = inject(ViewportService);
  protected readonly t = inject(I18nService).t;
  protected readonly list = inject(NotesListFacade);

  protected readonly filters = this.list.filters;
  protected readonly trashView = computed(() => this.filters().view === 'TRASHED');
  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly folderControl = new FormControl<string | null>(null);
  protected readonly creating = signal(false);
  protected readonly vaultOpen = signal(false);
  protected readonly confirmingEmpty = signal(false);

  protected readonly tree = this.list.tree;
  protected readonly folderChoices = computed(() => folderOptions(this.tree()));
  /** A árvore é parcial: diz quantas notas ela já cobre (nunca trunca em silêncio). */
  protected readonly treeNotice = computed(() => {
    const copy = this.t().notes.list;
    const count = String(this.list.treeNotes());
    return interpolate(this.list.treeMore() === 'capped' ? copy.treeCapped : copy.treePartial, {
      count,
    });
  });
  protected readonly selectedFolder = computed(() => this.filters().folder);
  /** Cofre sem nenhuma nota (nem filtro): estado vazio do DS 01. */
  protected readonly vaultEmpty = computed(() => {
    const items = this.list.items();
    return items !== null && items.length === 0 && !this.list.filtered() && !this.trashView();
  });
  protected readonly emptyActions = computed<readonly EmptyStateAction[]>(() => {
    const copy = this.t().emptyState.notes;
    return [
      { id: 'create-note', label: copy.createNote, available: true, primary: true },
      { id: 'import-vault', label: copy.importVault, available: true },
    ];
  });
  protected readonly actionError = computed(() => {
    const problem = this.list.actionProblem();
    return problem ? problemMessage(problem, this.t().errors) : null;
  });
  protected readonly loadError = this.list.error;

  constructor() {
    // URL → filtros (primeira carga, F5, voltar/avançar).
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const filters = filtersFromQuery((key) => params.get(key));
      this.search.setValue(filters.q, { emitEvent: false });
      this.folderControl.setValue(filters.folder, { emitEvent: false });
      this.list.apply(filters);
    });
    // Filtros → URL (a busca com debounce também passa por aqui).
    effect(() => {
      const query = filtersToQuery(this.filters());
      untracked(() => {
        const current = this.route.snapshot.queryParamMap;
        const same =
          current.keys.length === Object.keys(query).length &&
          Object.entries(query).every(([key, value]) => current.get(key) === value);
        if (!same) {
          void this.router.navigate([], {
            relativeTo: this.route,
            queryParams: query,
            replaceUrl: true,
          });
        }
      });
    });
    this.search.valueChanges.pipe(takeUntilDestroyed()).subscribe((term) => this.list.search(term));
    this.folderControl.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((folder) => this.selectFolder(folder));
    // Anuncia a quantidade de resultados depois de uma busca (leitor de tela).
    effect(() => {
      const items = this.list.items();
      const q = this.filters().q;
      if (items === null || q === '') return;
      untracked(() => {
        const copy = this.t().notes.list;
        this.announcer.announce(
          items.length === 0
            ? copy.resultsNone
            : interpolate(copy.resultsCount, { count: String(items.length) }),
        );
      });
    });
    this.list.restored$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.toast.show(this.t().notes.trash.restored);
    });
    this.list.emptied$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.confirmingEmpty.set(false);
      this.toast.show(this.t().notes.trash.emptied);
    });
    this.list.loadTreeAndTags();
  }

  protected selectFolder(folder: string | null): void {
    if (folder === this.filters().folder) return;
    this.list.apply({ ...this.filters(), folder });
  }

  protected selectTag(tag: string | null): void {
    this.list.apply({ ...this.filters(), tag });
  }

  protected clearFilters(): void {
    this.search.setValue('', { emitEvent: false });
    this.folderControl.setValue(null, { emitEvent: false });
    this.list.apply({ ...NO_FILTERS, view: this.filters().view });
  }

  protected onEmptyAction(id: string): void {
    if (id === 'create-note') this.creating.set(true);
    else if (id === 'import-vault') this.vaultOpen.set(true);
  }

  /** A importação terminou: a lista, as pastas e as tags voltam do backend (nada é chutado). */
  protected onImported(): void {
    this.list.loadTreeAndTags();
    this.list.retry();
  }

  protected created(note: Note): void {
    this.creating.set(false);
    void this.router.navigate(['/notes', note.id]);
  }

  protected askEmpty(): void {
    this.list.dismissProblem();
    this.confirmingEmpty.set(true);
  }

  protected cancelEmpty(): void {
    if (!this.list.busy()) this.confirmingEmpty.set(false);
  }
}
