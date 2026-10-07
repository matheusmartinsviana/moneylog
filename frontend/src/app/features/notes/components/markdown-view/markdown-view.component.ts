import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { IconComponent } from '~/app/common/components/icon/icon.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { MarkdownRenderService } from '~/app/features/notes/components/markdown-view/markdown-render.service';
import type { NoteLink } from '~/modules/notes/core/types/note';
import type { RenderOutcome } from '~/util/markdown/markdown-render';
import { wikilinkKey } from '~/util/markdown/wikilink-key';

/**
 * Desenha o Markdown de uma nota **sem injetar HTML** (S-159, ADR-009): `parseMarkdown` devolve uma árvore de
 * dados e este componente a desenha com templates do Angular (interpolação = texto escapado). Não existe
 * `innerHTML`, `DOMParser` nem `bypassSecurityTrust*`: HTML bruto (`<script>`, `<img onerror>`) aparece como
 * texto; links só `http(s)`/`mailto` (`rel="noopener noreferrer"`, `target="_blank"` nos externos); imagens
 * nunca carregam (anti-rastreio: aparece o texto alternativo); wikilinks são resolvidos **pelo backend**
 * (`links` da nota): resolvido vira link de navegação, sem alvo aparece "pendente" (nenhum alvo é inventado).
 * Presentational.
 */
@Component({
  selector: 'app-markdown-view',
  imports: [NgTemplateOutlet, RouterLink, IconComponent],
  providers: [MarkdownRenderService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="md" data-cy="markdown-view" [attr.aria-busy]="pending() || null">
      @if (plainText() !== null) {
        <p class="md__empty" role="status" data-cy="markdown-too-complex">
          {{ t().notes.markdown.tooComplex }}
        </p>
        <pre class="md__plain" tabindex="0" data-cy="markdown-plain">{{ plainText() }}</pre>
      } @else if (blocks().length === 0 && !pending()) {
        <p class="md__empty" data-cy="markdown-empty">{{ t().notes.editor.previewEmpty }}</p>
      }
      <ng-container
        [ngTemplateOutlet]="blocksTpl"
        [ngTemplateOutletContext]="{ $implicit: blocks() }"
      />
      @if (truncated()) {
        <p class="md__empty" role="status" data-cy="markdown-truncated">
          {{ t().notes.markdown.truncated }}
        </p>
      }
    </div>

    <ng-template #blocksTpl let-list>
      @for (block of list; track $index) {
        @switch (block.kind) {
          @case ('heading') {
            @switch (block.depth) {
              @case (1) {
                <h2>
                  <ng-container
                    [ngTemplateOutlet]="inlinesTpl"
                    [ngTemplateOutletContext]="{ $implicit: block.children }"
                  />
                </h2>
              }
              @case (2) {
                <h3>
                  <ng-container
                    [ngTemplateOutlet]="inlinesTpl"
                    [ngTemplateOutletContext]="{ $implicit: block.children }"
                  />
                </h3>
              }
              @case (3) {
                <h4>
                  <ng-container
                    [ngTemplateOutlet]="inlinesTpl"
                    [ngTemplateOutletContext]="{ $implicit: block.children }"
                  />
                </h4>
              }
              @case (4) {
                <h5>
                  <ng-container
                    [ngTemplateOutlet]="inlinesTpl"
                    [ngTemplateOutletContext]="{ $implicit: block.children }"
                  />
                </h5>
              }
              @default {
                <h6>
                  <ng-container
                    [ngTemplateOutlet]="inlinesTpl"
                    [ngTemplateOutletContext]="{ $implicit: block.children }"
                  />
                </h6>
              }
            }
          }
          @case ('paragraph') {
            <p>
              <ng-container
                [ngTemplateOutlet]="inlinesTpl"
                [ngTemplateOutletContext]="{ $implicit: block.children }"
              />
            </p>
          }
          @case ('code') {
            <pre tabindex="0"><code>{{ block.text }}</code></pre>
          }
          @case ('quote') {
            <blockquote>
              <ng-container
                [ngTemplateOutlet]="blocksTpl"
                [ngTemplateOutletContext]="{ $implicit: block.children }"
              />
            </blockquote>
          }
          @case ('hr') {
            <hr />
          }
          @case ('footnote') {
            <p class="md__footnote" data-cy="md-footnote">
              <sup>{{ block.label }}</sup>
              <ng-container
                [ngTemplateOutlet]="inlinesTpl"
                [ngTemplateOutletContext]="{ $implicit: block.children }"
              />
            </p>
          }
          @case ('list') {
            @if (block.ordered) {
              <ol [attr.start]="block.start">
                @for (item of block.items; track $index) {
                  <li [class.md__task]="item.task">
                    @if (item.task) {
                      <span
                        class="md__check"
                        role="img"
                        [attr.aria-label]="
                          item.checked ? t().notes.markdown.taskDone : t().notes.markdown.taskOpen
                        "
                      >
                        @if (item.checked) {
                          <app-icon name="check" [size]="14" />
                        }
                      </span>
                    }
                    <ng-container
                      [ngTemplateOutlet]="blocksTpl"
                      [ngTemplateOutletContext]="{ $implicit: item.children }"
                    />
                  </li>
                }
              </ol>
            } @else {
              <ul>
                @for (item of block.items; track $index) {
                  <li [class.md__task]="item.task">
                    @if (item.task) {
                      <span
                        class="md__check"
                        role="img"
                        [attr.aria-label]="
                          item.checked ? t().notes.markdown.taskDone : t().notes.markdown.taskOpen
                        "
                      >
                        @if (item.checked) {
                          <app-icon name="check" [size]="14" />
                        }
                      </span>
                    }
                    <ng-container
                      [ngTemplateOutlet]="blocksTpl"
                      [ngTemplateOutletContext]="{ $implicit: item.children }"
                    />
                  </li>
                }
              </ul>
            }
          }
          @case ('table') {
            <div class="md__scroll" tabindex="0">
              <table>
                <thead>
                  <tr>
                    @for (cell of block.header; track $index) {
                      <th
                        scope="col"
                        [class.md__right]="block.align[$index] === 'right'"
                        [class.md__center]="block.align[$index] === 'center'"
                      >
                        <ng-container
                          [ngTemplateOutlet]="inlinesTpl"
                          [ngTemplateOutletContext]="{ $implicit: cell }"
                        />
                      </th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (row of block.rows; track $index) {
                    <tr>
                      @for (cell of row; track $index) {
                        <td
                          [class.md__right]="block.align[$index] === 'right'"
                          [class.md__center]="block.align[$index] === 'center'"
                        >
                          <ng-container
                            [ngTemplateOutlet]="inlinesTpl"
                            [ngTemplateOutletContext]="{ $implicit: cell }"
                          />
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
      }
    </ng-template>

    <ng-template #inlinesTpl let-nodes>
      @for (node of nodes; track $index) {
        @switch (node.kind) {
          @case ('text') {
            {{ node.text }}
          }
          @case ('strong') {
            <strong
              ><ng-container
                [ngTemplateOutlet]="inlinesTpl"
                [ngTemplateOutletContext]="{ $implicit: node.children }"
            /></strong>
          }
          @case ('em') {
            <em
              ><ng-container
                [ngTemplateOutlet]="inlinesTpl"
                [ngTemplateOutletContext]="{ $implicit: node.children }"
            /></em>
          }
          @case ('del') {
            <del
              ><ng-container
                [ngTemplateOutlet]="inlinesTpl"
                [ngTemplateOutletContext]="{ $implicit: node.children }"
            /></del>
          }
          @case ('code') {
            <code>{{ node.text }}</code>
          }
          @case ('br') {
            <br />
          }
          @case ('footnote') {
            <sup class="md__footnote-ref" data-cy="md-footnote-ref">{{ node.label }}</sup>
          }
          @case ('checkbox') {
            <span
              class="md__check"
              role="img"
              [attr.aria-label]="
                node.checked ? t().notes.markdown.taskDone : t().notes.markdown.taskOpen
              "
            ></span>
          }
          @case ('link') {
            <a
              class="md__link"
              [href]="node.href"
              rel="noopener noreferrer"
              [attr.target]="node.external ? '_blank' : null"
              data-cy="md-link"
            >
              <ng-container
                [ngTemplateOutlet]="inlinesTpl"
                [ngTemplateOutletContext]="{ $implicit: node.children }"
              />
              @if (node.external) {
                <span class="visually-hidden"> ({{ t().notes.markdown.externalLink }})</span>
              }
            </a>
            @if (node.host) {
              <bdi class="md__host" data-cy="md-link-host">{{ node.host }}</bdi>
            }
          }
          @case ('image') {
            <span class="md__blocked" data-cy="md-image-blocked">{{ imageLabel(node.alt) }}</span>
          }
          @case ('wikilink') {
            @let target = resolve(node.target);
            @if (target) {
              <a class="md__wikilink" [routerLink]="['/notes', target]" data-cy="md-wikilink">{{
                node.label
              }}</a>
              @if (node.embed) {
                <span class="md__tag" data-cy="md-embed">{{ t().notes.markdown.embedNote }}</span>
              }
            } @else {
              <button
                type="button"
                class="md__wikilink md__wikilink--pending"
                data-cy="md-wikilink-pending"
                [attr.aria-label]="node.label + ', ' + t().notes.markdown.wikilinkPending"
                (click)="createNote.emit(node.target)"
              >
                {{ node.label }}
                <span class="md__tag" aria-hidden="true">{{
                  t().notes.markdown.wikilinkPending
                }}</span>
              </button>
            }
          }
        }
      }
    </ng-template>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .md {
      overflow-wrap: anywhere;
      font-size: var(--text-md);
      line-height: var(--leading-normal);
    }

    .md > :first-child {
      margin-top: 0;
    }

    .md p,
    .md ul,
    .md ol,
    .md pre,
    .md blockquote,
    .md .md__scroll {
      margin: 0 0 var(--space-3);
    }

    .md h2,
    .md h3,
    .md h4,
    .md h5,
    .md h6 {
      margin: var(--space-5) 0 var(--space-2);
      line-height: var(--leading-tight);
    }

    .md h2 {
      font-size: var(--text-xl);
    }

    .md h3 {
      font-size: var(--text-lg);
    }

    .md h4,
    .md h5,
    .md h6 {
      font-size: var(--text-md);
    }

    .md ul,
    .md ol {
      padding-left: var(--space-6);
    }

    .md li > p {
      margin: 0;
    }

    .md blockquote {
      padding-left: var(--space-3);
      border-left: 3px solid var(--color-border);
      color: var(--color-text-muted);
    }

    .md code {
      padding: 1px 4px;
      border-radius: 6px;
      background-color: var(--color-surface-muted);
      font-family: var(--font-mono);
      font-size: 0.9em;
    }

    .md pre {
      padding: var(--space-3);
      overflow-x: auto;
      border-radius: var(--radius-control);
      background-color: var(--color-surface-muted);
    }

    .md pre code {
      padding: 0;
      background: none;
    }

    .md pre:focus-visible,
    .md__scroll:focus-visible {
      outline: none;
      box-shadow: var(--focus-ring);
    }

    .md__scroll {
      overflow-x: auto;
    }

    .md table {
      border-collapse: collapse;
      font-size: var(--text-sm);
    }

    .md th,
    .md td {
      padding: var(--space-1) var(--space-3);
      border: var(--border-width) solid var(--color-border);
    }

    .md__right {
      text-align: right;
    }

    .md__center {
      text-align: center;
    }

    .md hr {
      border: 0;
      border-top: var(--border-width) solid var(--color-border);
    }

    .md__link,
    .md__wikilink {
      color: var(--color-accent);
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    .md__wikilink--pending {
      padding: 0;
      border: 0;
      background: none;
      color: var(--color-text-muted);
      font: inherit;
      text-decoration: underline dashed;
      cursor: pointer;
    }

    .md__link:focus-visible,
    .md__wikilink:focus-visible {
      outline: none;
      box-shadow: var(--focus-ring);
    }

    .md__tag {
      margin-left: var(--space-1);
      padding: 0 var(--space-2);
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-pill);
      color: var(--color-text-muted);
      font-size: var(--text-xs);
    }

    .md__blocked {
      padding: 0 var(--space-2);
      border: var(--border-width) dashed var(--color-border);
      border-radius: var(--radius-control);
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .md__task {
      list-style: none;
      margin-left: calc(var(--space-6) * -1);
    }

    .md__check {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1rem;
      height: 1rem;
      margin-right: var(--space-2);
      border: var(--border-width) solid var(--color-text-muted);
      border-radius: 4px;
      vertical-align: -2px;
    }

    .md__empty {
      color: var(--color-text-muted);
    }

    .md__host {
      margin-left: var(--space-1);
      color: var(--color-text-muted);
      font-size: var(--text-xs);
    }

    .md__host::before {
      content: '↗ ';
    }

    .md__footnote {
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .md__plain {
      white-space: pre-wrap;
    }
  `,
})
export class MarkdownViewComponent {
  protected readonly t = inject(I18nService).t;

  /** O texto da nota (Markdown cru, como o usuário escreveu). */
  readonly source = input.required<string>();
  /** Os vínculos da nota devolvidos pelo backend: é deles que o wikilink sai resolvido ou pendente. */
  readonly links = input<readonly NoteLink[]>([]);

  /** O usuário pediu para criar a nota de um link pendente (`target` = o texto do wikilink). */
  readonly createNote = output<string>();

  private readonly renderer = inject(MarkdownRenderService);
  /** O resultado mais recente (o anterior continua na tela enquanto o novo é calculado, sem piscar). */
  private readonly outcome = signal<RenderOutcome | null>(null);
  protected readonly pending = signal(false);
  private readonly document = computed(() => {
    const outcome = this.outcome();
    return outcome?.kind === 'document' ? outcome.document : null;
  });
  protected readonly blocks = computed(() => this.document()?.blocks ?? []);
  protected readonly truncated = computed(() => this.document()?.truncated === true);
  /** Quando o Markdown é pesado demais para formatar: o texto como está, legível. */
  protected readonly plainText = computed(() => {
    const outcome = this.outcome();
    return outcome?.kind === 'plain' ? outcome.text : null;
  });

  constructor() {
    // O parsing roda num Web Worker com tempo limite; um texto novo descarta o resultado do anterior.
    effect(() => {
      const text = this.source();
      untracked(() => {
        this.pending.set(true);
        void this.renderer.render(text).then((outcome) => {
          if (outcome === null) return;
          this.outcome.set(outcome);
          this.pending.set(false);
        });
      });
    });
  }

  private readonly resolved = computed(() => {
    const map = new Map<string, string>();
    for (const link of this.links()) {
      if (
        link.origin === 'WIKILINK' &&
        link.state === 'RESOLVED' &&
        link.type === 'NOTE' &&
        link.text !== null &&
        link.target?.id
      ) {
        map.set(wikilinkKey(link.text), link.target.id);
      }
    }
    return map;
  });

  /** Id da nota que o backend resolveu para este alvo, ou `null` (pendente: nunca se inventa o alvo). */
  protected resolve(target: string): string | null {
    return this.resolved().get(wikilinkKey(target)) ?? null;
  }

  protected imageLabel(alt: string): string {
    const copy = this.t().notes.markdown;
    return alt.trim() === '' ? copy.imageBlockedNoAlt : interpolate(copy.imageBlocked, { alt });
  }
}
