import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
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
import { localEngine } from '@embedpdf/engine';

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// One thread: the first comment, its replies, a reply box, and a button that shows it.
@Component({
  selector: 'article[demoThread]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'thread' },
  template: `
    <header class="thread-head">
      <span class="where">Page {{ thread().pageLabel }}</span>
      <button type="button" class="show" (click)="show()">Show</button>
    </header>
    <p class="comment">
      <strong>{{ thread().root.author }}</strong> {{ thread().root.contents }}
    </p>
    @for (reply of thread().replies; track key(reply.ref)) {
      <p class="comment reply">
        <strong>{{ reply.author }}</strong> {{ reply.contents }}
      </p>
    }
    @if (comments.canReply(thread().root.ref)) {
      <form class="reply-form" (submit)="$event.preventDefault(); reply()">
        <input
          #field
          class="field"
          aria-label="Reply"
          placeholder="Reply…"
          [value]="text()"
          (input)="text.set(field.value)"
        />
      </form>
    }
  `,
})
export class Thread {
  readonly thread = input.required<CommentThreadView>();
  readonly stage = input.required<EpdfStage>();

  protected readonly comments = inject(EpdfComments);
  private readonly annotation = inject(EpdfAnnotation);
  protected readonly text = signal('');
  protected readonly key = annotationKey;

  protected show() {
    const { page, root } = this.thread();
    this.stage().reveal(page, { rect: root.rect });
    this.annotation.selection.set([root.ref]); // and select it
  }

  protected reply() {
    const text = this.text().trim();
    if (!text) return;
    void this.comments.reply(this.thread().root.ref, text);
    this.text.set('');
  }
}

/**
 * Every thread in the document, in reading order. Next to `<epdf-stage #stage="epdfStage">`:
 * `<div demoComments [stage]="stage"></div>`.
 */
@Component({
  selector: 'div[demoComments]',
  imports: [Thread],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'panel threads' },
  template: `
    @if (loading()) {
      <p class="empty">Loading comments…</p>
    } @else if (comments.threads().length === 0) {
      <p class="empty">No comments</p>
    }
    @for (thread of comments.threads(); track key(thread.root.ref)) {
      <article demoThread [thread]="thread" [stage]="stage()"></article>
    }
  `,
})
export class Comments {
  readonly stage = input.required<EpdfStage>();

  protected readonly comments = inject(EpdfComments);
  private readonly annotation = inject(EpdfAnnotation);
  protected readonly loading = computed(() => this.annotation.status() === 'loading');
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
    Comments,
  ],
  providers: [
    provideEmbedPdf(
      {
        engine: () => localEngine(),
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
  styleUrl: './comments.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="viewer">
        <epdf-stage #stage="epdfStage" class="stage">
          <ng-template epdfPage>
            <epdf-render-layer [annotations]="false" />
            <epdf-annotation-layer />
          </ng-template>
        </epdf-stage>
        <div demoComments [stage]="stage"></div>
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
    // On load: a note with two replies on the cover, and a highlight with a comment on page 2.
    effect(() => {
      const [cover, second] = this.pages();
      if (this.annotation.status() !== 'ready' || !cover || !second || this.added) return;
      this.added = true;
      void this.annotation
        .create(cover.ref, {
          subtype: 'text',
          rect: { x: 470, y: 232, width: 20, height: 20 },
          contents: 'Can we shorten the title?',
          color: '#facc15',
        })
        .then(async ({ annotation: note }) => {
          await this.comments.reply(note.ref, 'Maybe drop "(But they Don’t Have to Be)".');
          await this.comments.reply(note.ref, 'I like it long. It’s a promise.');
        });
      void this.annotation.create(second.ref, {
        subtype: 'highlight',
        quadPoints: [
          {
            upperLeft: { x: 57, y: 57 },
            upperRight: { x: 322, y: 57 },
            lowerLeft: { x: 57, y: 129 },
            lowerRight: { x: 322, y: 129 },
          },
        ],
        color: '#ffcd45',
        contents: 'A strong opening.',
      });
    });
  }
}
