import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { FolderTreeComponent } from '~/app/features/notes/components/folder-tree/folder-tree.component';
import { MarkdownViewComponent } from '~/app/features/notes/components/markdown-view/markdown-view.component';
import { VaultSectionComponent } from '~/app/features/notes/components/vault-section/vault-section.component';
import { splitFrontmatter } from '~/app/features/vault/frontmatter';
import { NoteEditorFacade } from '~/modules/notes/core/facades/note-editor.facade';
import { NotesListFacade } from '~/modules/notes/core/facades/notes-list.facade';
import { VaultOverviewFacade } from '~/modules/notes/core/facades/vault-overview.facade';
import { formatInstant } from '~/util/date';

/**
 * `/vault` (T221, smart): o cartão do vault (data da última alteração lida do backend, **sem contagem de notas**
 * e **sem selo "sincronizado"**: o vault mora no servidor, e levar para outro lugar é exportar/importar o zip),
 * a árvore de pastas real, a lista de notas da pasta e a **prévia** da nota escolhida. O Markdown é desenhado
 * pelo `app-markdown-view` (sem `innerHTML`); o bloco de metadados (frontmatter) aparece como texto escapado.
 * Editar continua em `/notes/:id`.
 */
@Component({
  selector: 'app-vault-page',
  imports: [
    RouterLink,
    PageLayoutComponent,
    FolderTreeComponent,
    MarkdownViewComponent,
    VaultSectionComponent,
  ],
  providers: [NotesListFacade, NoteEditorFacade, VaultOverviewFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './vault.page.html',
  styleUrl: './vault.page.css',
})
export class VaultPage {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  protected readonly list = inject(NotesListFacade);
  protected readonly editor = inject(NoteEditorFacade);
  protected readonly overview = inject(VaultOverviewFacade);

  protected readonly selectedId = signal<string | null>(null);
  protected readonly folder = computed(() => this.list.filters().folder);

  protected readonly lastChange = computed(() => {
    const iso = this.overview.lastChange();
    return iso
      ? interpolate(this.t().workspacePages.vault.lastChange, {
          date: formatInstant(iso, HTML_LANG[this.i18n.language()]),
        })
      : null;
  });

  protected readonly split = computed(() => {
    const note = this.editor.note();
    return note ? splitFrontmatter(note.body) : null;
  });

  constructor() {
    this.list.loadTreeAndTags();
    this.overview.load();
    // A nota escolhida vem do backend; uma nota que sumiu da lista deixa de ser a escolhida.
    effect(() => {
      const items = this.list.items();
      const selected = this.selectedId();
      if (items === null || selected === null) return;
      if (!items.some((note) => note.id === selected)) untracked(() => this.selectedId.set(null));
    });
  }

  protected selectFolder(folder: string | null): void {
    if (folder === this.folder()) return;
    this.list.apply({ ...this.list.filters(), folder });
  }

  protected select(id: string): void {
    this.selectedId.set(id);
    this.editor.load(id);
  }

  protected onImported(): void {
    this.list.loadTreeAndTags();
    this.list.retry();
    this.overview.load();
  }
}
