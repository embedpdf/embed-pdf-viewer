import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import {
  annotationKey,
  EpdfAnnotation,
  EpdfAnnotationLayer,
  EpdfComments,
  withAnnotation,
  type CommentThreadView,
} from '@embedpdf/angular/annotation';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

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
    EpdfAnnotationLayer,
    Reviews,
  ],
  providers: [
    provideEmbedPdf(
      {
        engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }),
        identity: { userId: 'u_381', displayName: 'Dana Smith' },
        initialDocuments: [{ source: ebook }],
      },
      withStage(),
      withRender(),
      withInteraction(),
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
            <epdf-render-layer [annotations]="false" />
            <epdf-annotation-layer />
          </ng-template>
        </epdf-stage>
        <div demoReviews></div>
      </div>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  private readonly annotation = inject(EpdfAnnotation);
  private readonly comments = inject(EpdfComments);
  private readonly pages = inject(EpdfDocument).pages;
  private added = false;

  constructor() {
    // On load: two notes on the cover, one already accepted.
    effect(() => {
      const cover = this.pages()[0]?.ref;
      if (this.annotation.status() !== 'ready' || !cover || this.added) return;
      this.added = true;
      void this.annotation.create(cover, {
        subtype: 'text',
        rect: { x: 470, y: 232, width: 20, height: 20 },
        contents: 'Can we shorten the title?',
        color: '#facc15',
      });
      void this.annotation
        .create(cover, {
          subtype: 'text',
          rect: { x: 280, y: 520, width: 20, height: 20 },
          contents: 'Add the co-author',
          color: '#facc15',
        })
        .then(({ annotation: note }) => this.comments.setStatus(note.ref, 'accepted'));
    });
  }
}
