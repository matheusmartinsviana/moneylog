import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';

import { IconComponent } from '~/app/common/components/icon/icon.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { DisplayTextPipe } from '~/app/common/pipes/display-text.pipe';
import type { FolderNode } from '~/modules/notes/core/types/note-path';

/** Chave do item "Todas as notas" (a raiz da árvore). */
const ALL = '';

interface Row {
  readonly path: string;
  readonly node: FolderNode | null;
  readonly level: number;
  readonly expandable: boolean;
  readonly expanded: boolean;
}

/**
 * Árvore de pastas do vault (padrão `tree` do APG, `role="tree"`): derivada dos caminhos das notas. Um só
 * item na ordem de tabulação (tabindex móvel); `↓`/`↑` andam pelos itens visíveis, `→` abre a pasta (ou
 * desce ao primeiro filho), `←` fecha (ou sobe ao pai), `Home`/`End`, `Enter`/Espaço escolhem a pasta. Escolher
 * a pasta filtra a lista (as subpastas entram). Presentational: quem usa controla `selected`.
 */
@Component({
  selector: 'app-folder-tree',
  imports: [NgTemplateOutlet, IconComponent, DisplayTextPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="tree" role="tree" data-cy="folder-tree" [attr.aria-label]="label()">
      <ng-container
        [ngTemplateOutlet]="item"
        [ngTemplateOutletContext]="{ node: null, level: 1 }"
      />
    </ul>

    <ng-template #item let-node="node" let-level="level">
      @let path = node ? node.path : '';
      @let isOpen = expandedSet().has(path);
      @let hasChildren = node ? node.children.length > 0 : root().children.length > 0;
      <li role="none">
        <div
          class="tree__item"
          role="treeitem"
          [class.is-selected]="selected() === (node ? node.path : null)"
          [attr.aria-level]="level"
          [attr.aria-selected]="selected() === (node ? node.path : null)"
          [attr.aria-expanded]="hasChildren ? isOpen : null"
          [attr.data-path]="path"
          [attr.data-cy]="'folder-' + (node ? path : 'all')"
          [attr.aria-label]="rowLabel(node)"
          [tabindex]="focused() === path ? 0 : -1"
          [attr.data-level]="level"
          (keydown)="onKey($event)"
          (click)="choose(node ? node.path : null, path)"
          (focus)="focused.set(path)"
        >
          @if (node && hasChildren) {
            <span
              class="tree__toggle"
              aria-hidden="true"
              [attr.data-cy]="'folder-toggle-' + path"
              (click)="toggle($event, path)"
            >
              <app-icon [name]="isOpen ? 'chevronDown' : 'chevronRight'" [size]="16" />
            </span>
          } @else {
            <span class="tree__toggle" aria-hidden="true"></span>
          }
          <app-icon name="folder" [size]="16" />
          <span class="tree__name"
            ><bdi>{{ node ? (node.name | displayText) : allLabel() }}</bdi></span
          >
          <span class="tree__count num" aria-hidden="true">{{
            node ? node.count : root().count
          }}</span>
        </div>
        @if (!node || (hasChildren && isOpen)) {
          @if ((node ? node.children : root().children).length > 0) {
            <ul role="group">
              @for (child of node ? node.children : root().children; track child.path) {
                <ng-container
                  [ngTemplateOutlet]="item"
                  [ngTemplateOutletContext]="{ node: child, level: level + 1 }"
                />
              }
            </ul>
          }
        }
      </li>
    </ng-template>
  `,
  styles: `
    :host {
      display: block;
    }

    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .tree__item {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-height: 2.25rem;
      padding-right: var(--space-2);
      border-radius: var(--radius-control);
      color: var(--color-text);
      font-size: var(--text-sm);
      cursor: pointer;
    }

    .tree__item[data-level='1'] {
      padding-left: 0.5rem;
    }

    .tree__item[data-level='2'] {
      padding-left: 1.75rem;
    }

    .tree__item[data-level='3'] {
      padding-left: 3rem;
    }

    .tree__item[data-level='4'] {
      padding-left: 4.25rem;
    }

    .tree__item[data-level='5'] {
      padding-left: 5.5rem;
    }

    .tree__item[data-level='6'] {
      padding-left: 6.75rem;
    }

    .tree__item[data-level='7'] {
      padding-left: 8rem;
    }

    .tree__item[data-level='8'] {
      padding-left: 9.25rem;
    }

    .tree__item[data-level='9'] {
      padding-left: 10.5rem;
    }

    .tree__item[data-level='10'] {
      padding-left: 11.75rem;
    }

    .tree__item[data-level='11'] {
      padding-left: 13rem;
    }

    .tree__item:hover {
      background-color: var(--color-surface-muted);
    }

    .tree__item:focus-visible {
      outline: none;
      box-shadow: var(--focus-ring);
    }

    .tree__item.is-selected {
      background-color: var(--color-surface-muted);
      box-shadow: inset 2px 0 0 var(--color-accent);
      font-weight: var(--weight-medium);
    }

    .tree__toggle {
      display: inline-flex;
      flex: none;
      width: 1rem;
      color: var(--color-text-muted);
    }

    .tree__name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tree__count {
      color: var(--color-text-muted);
      font-size: var(--text-xs);
    }
  `,
})
export class FolderTreeComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly i18n = inject(I18nService);

  readonly root = input.required<FolderNode>();
  /** Pasta escolhida; `null` = todas as notas. */
  readonly selected = input<string | null>(null);
  /** Nome acessível da árvore. */
  readonly label = input.required<string>();
  readonly allLabel = input.required<string>();

  readonly selectFolder = output<string | null>();

  protected readonly expandedSet = signal<ReadonlySet<string>>(new Set([ALL]));
  protected readonly focused = signal(ALL);

  /** Itens visíveis, em ordem (para o teclado). */
  private readonly rows = computed<readonly Row[]>(() => {
    const open = this.expandedSet();
    const out: Row[] = [
      {
        path: ALL,
        node: null,
        level: 1,
        expandable: this.root().children.length > 0,
        expanded: true,
      },
    ];
    const walk = (nodes: readonly FolderNode[], level: number) => {
      for (const node of nodes) {
        const expanded = open.has(node.path);
        out.push({ path: node.path, node, level, expandable: node.children.length > 0, expanded });
        if (expanded) walk(node.children, level + 1);
      }
    };
    walk(this.root().children, 2);
    return out;
  });

  constructor() {
    // A pasta escolhida (URL) abre os ancestrais e fica como item focável.
    effect(() => {
      const selected = this.selected();
      untracked(() => {
        if (selected === null) return;
        const parts = selected.split('/');
        const next = new Set(this.expandedSet());
        for (let i = 1; i < parts.length; i++) next.add(parts.slice(0, i).join('/'));
        this.expandedSet.set(next);
        this.focused.set(selected);
      });
    });
  }

  protected rowLabel(node: FolderNode | null): string {
    const copy = this.i18n.t().notes.list;
    const name = node ? node.name : this.allLabel();
    const count = node ? node.count : this.root().count;
    return interpolate(copy.folderItem, { name, count: String(count) });
  }

  protected choose(folder: string | null, path: string): void {
    this.focused.set(path);
    this.selectFolder.emit(folder);
  }

  protected toggle(event: Event, path: string): void {
    event.stopPropagation();
    this.setExpanded(path, !this.expandedSet().has(path));
  }

  private setExpanded(path: string, open: boolean): void {
    const next = new Set(this.expandedSet());
    if (open) next.add(path);
    else next.delete(path);
    this.expandedSet.set(next);
  }

  protected onKey(event: KeyboardEvent): void {
    const rows = this.rows();
    const index = Math.max(
      0,
      rows.findIndex((row) => row.path === this.focused()),
    );
    const row = rows[index];
    if (!row) return;
    let target: number | null = null;
    switch (event.key) {
      case 'ArrowDown':
        target = Math.min(rows.length - 1, index + 1);
        break;
      case 'ArrowUp':
        target = Math.max(0, index - 1);
        break;
      case 'Home':
        target = 0;
        break;
      case 'End':
        target = rows.length - 1;
        break;
      case 'ArrowRight':
        if (row.expandable && !row.expanded) this.setExpanded(row.path, true);
        else if (row.expandable) target = Math.min(rows.length - 1, index + 1);
        break;
      case 'ArrowLeft':
        if (row.expandable && row.expanded && row.path !== ALL) this.setExpanded(row.path, false);
        else if (row.path !== ALL) {
          const parent = [...rows.slice(0, index)]
            .reverse()
            .find((candidate) => candidate.level === row.level - 1);
          target = parent ? rows.indexOf(parent) : null;
        }
        break;
      case 'Enter':
      case ' ':
        this.selectFolder.emit(row.node ? row.node.path : null);
        break;
      default:
        return;
    }
    event.preventDefault();
    if (target !== null && target !== index) {
      const path = rows[target]?.path ?? ALL;
      this.focused.set(path);
      afterNextRender(
        () =>
          Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('[role="treeitem"]'))
            .find((el) => el.dataset['path'] === path)
            ?.focus(),
        { injector: this.injector },
      );
    }
  }
}
