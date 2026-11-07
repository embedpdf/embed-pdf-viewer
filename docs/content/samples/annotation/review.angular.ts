import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
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
  EpdfAnnotationLayer,
  EpdfComments,
  withAnnotation,
  type CommentThreadView,
} from '@embedpdf/angular/annotation';
import { localEngine } from '@embedpdf/engine';

// [!doc-source proposal]
const proposal = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/proposal.pdf');
  return { kind: 'bytes', id: 'proposal', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// A thread's verdict, its check mark, and the buttons the user may use.
@Component({
  selector: 'article[demoReview]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'thread' },
  template: `
    <p class="comment">
      <strong>{{ thread().root.author }}</strong> {{ thread().root.contents }}
    </p>
    <p class="verdict">
      <span [class]="'state state--' + verdict()">{{ verdict() }}</span>
      @if (marked()) {
        <span class="mark">✓ checked off</span>
      }
    </p>
    <div class="actions">
      <button
        type="button"
        class="button"
        [disabled]="!comments.canSetStatus(ref())"
        (click)="comments.setStatus(ref(), 'accepted')"
      >
        Accept
      </button>
      <button
        type="button"
        class="button"
        [disabled]="!comments.canSetStatus(ref())"
        (click)="comments.setStatus(ref(), 'rejected')"
      >
        Reject
      </button>
      <button
        type="button"
        class="button"
        [attr.aria-pressed]="marked()"
        [disabled]="!comments.canSetMarked(ref())"
        (click)="comments.setMarked(ref(), !marked())"
      >
        ✓
      </button>
      <button
        type="button"
        class="button"
        [disabled]="!comments.canDeleteThread(ref())"
        (click)="comments.deleteThread(ref())"
      >
        Delete
      </button>
    </div>
  `,
})
export class Review {
  readonly thread = input.required<CommentThreadView>();

  protected readonly comments = inject(EpdfComments);
  protected readonly ref = computed(() => this.thread().root.ref);
  protected readonly verdict = computed(() => this.thread().review.lastChange?.state ?? 'none');
  protected readonly marked = computed(() => this.thread().review.markedBy.length > 0);
}

@Component({
  selector: 'div[demoReviews]',
  imports: [Review],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'panel threads' },
  template: `
    @for (thread of comments.threads(); track key(thread.root.ref)) {
      <article demoReview [thread]="thread"></article>
    } @empty {
      <p class="empty">No comments</p>
    }
  `,
})
export class Reviews {
  protected readonly comments = inject(EpdfComments);
  protected readonly key = annotationKey;
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
    Reviews,
  ],
  providers: [
    provideEmbedPdf(
      {
        engine: () => localEngine(),
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
  styleUrl: './review.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="viewer">
        <epdf-stage class="stage">
          <ng-template epdfPage>
            <epdf-render-layer />
            <epdf-selection-layer />
            <epdf-annotation-layer />
          </ng-template>
        </epdf-stage>
        <div demoReviews></div>
      </div>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
