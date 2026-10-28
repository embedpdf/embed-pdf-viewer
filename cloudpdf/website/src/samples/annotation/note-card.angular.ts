import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfSelectionLayer, withSelection } from '@embedpdf/angular/selection';
import { withInteraction } from '@embedpdf/angular/interaction';
import {
  annotationKey,
  EpdfAnnotation,
  EpdfAnnotationLayer,
  EpdfAnnotationMenu,
  EpdfComments,
  withAnnotation,
} from '@embedpdf/angular/annotation';
import { cloudEngine } from '@cloudpdf/engine';

const proposal: OpenInput = { kind: 'share', shareToken: 'shr_qnqHtCNRpzz-s7DPFBIbuOAF' };

// The clicked annotation's comment and its replies, in your own card next to it: a note, or any
// mark that carries a comment, such as a highlight. It shows while the annotation is selected.
@Component({
  selector: 'demo-note-card',
  imports: [EpdfAnnotationMenu],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:keydown)': 'close($event)' },
  template: `
    @if (thread(); as thread) {
      <!-- No card without a comment to read. -->
      @if (thread.root.contents) {
        <epdf-annotation-menu placement="right">
          <article class="note-card">
            <p class="comment">
              <strong>{{ thread.root.author }}</strong> {{ thread.root.contents }}
            </p>
            @for (each of thread.replies; track key(each.ref)) {
              <p class="comment reply">
                <strong>{{ each.author }}</strong> {{ each.contents }}
              </p>
            }
            @if (comments.canReply(thread.root.ref)) {
              <form class="reply-form" (submit)="$event.preventDefault(); send()">
                <input
                  #field
                  class="field"
                  aria-label="Reply"
                  placeholder="Reply…"
                  [value]="reply()"
                  (input)="reply.set(field.value)"
                />
              </form>
            }
          </article>
        </epdf-annotation-menu>
      }
    }
  `,
})
export class NoteCard {
  private readonly annotation = inject(EpdfAnnotation);
  protected readonly comments = inject(EpdfComments);
  protected readonly thread = this.comments.threadOf(() => {
    const selected = this.annotation.selected();
    return selected.length === 1 ? selected[0]!.ref : null;
  });
  protected readonly reply = signal('');
  protected readonly key = annotationKey;

  // Escape closes the card, as it ends the selection.
  protected close(event: KeyboardEvent) {
    if (event.key === 'Escape') this.annotation.selection.clear();
  }

  protected send() {
    const thread = this.thread();
    const text = this.reply().trim();
    if (!thread || !text) return;
    void this.comments.reply(thread.root.ref, text);
    this.reply.set('');
  }
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfSelectionLayer,
    EpdfAnnotationLayer,
    NoteCard,
  ],
  providers: [
    provideEmbedPdf(
      {
        engine: () => cloudEngine(),
        identity: { userId: 'u_381', displayName: 'Dana Smith' },
        initialDocuments: [{ source: proposal }],
      },
      withStage(),
      withRender(),
      withInteraction(),
      withSelection(),
      withAnnotation(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './note-card.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <p class="hint">Click the note next to the title, or the highlighted sentence</p>
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-selection-layer />
          <epdf-annotation-layer />
        </ng-template>
        <demo-note-card />
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
