import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { withSearch } from '@embedpdf/angular/search';
import {
  annotationKey,
  EpdfAnnotation,
  EpdfAnnotationLayer,
  withAnnotation,
} from '@embedpdf/angular/annotation';
import { EpdfRedaction, withRedaction } from '@embedpdf/angular/redaction';
import { localEngine } from '@embedpdf/engine';

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

/** Next to `<epdf-stage #stage="epdfStage">`: `<div demoPendingMarks [stage]="stage"></div>`. */
@Component({
  selector: 'div[demoPendingMarks]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'panel' },
  template: `
    <div class="panel-head">
      <span class="readout">{{ count() }}</span>
      <button
        type="button"
        class="button"
        [disabled]="!redaction.pendingCount()"
        (click)="redaction.clearPending()"
      >
        Remove all
      </button>
    </div>
    <ul class="marks">
      @for (mark of redaction.pending(); track key(mark.ref)) {
        <li class="mark">
          <button
            type="button"
            class="mark-go"
            (click)="stage().reveal(mark.page, { rect: mark.bounds })"
          >
            <span class="mark-page">Page {{ mark.pageIndex + 1 }}</span>
            <span class="mark-kind">{{ mark.kind === 'text' ? 'Text' : 'Area' }}</span>
          </button>
          <button
            type="button"
            class="button"
            [disabled]="!redaction.canUnmark(mark.ref)"
            (click)="redaction.unmark([mark.ref])"
          >
            Remove
          </button>
        </li>
      }
    </ul>
  `,
})
export class PendingMarks {
  readonly stage = input.required<EpdfStage>();

  // pending(): the marks not applied yet, in page order.
  protected readonly redaction = inject(EpdfRedaction);
  protected readonly key = annotationKey;
  protected readonly count = computed(() => {
    const count = this.redaction.pendingCount();
    return `${count} ${count === 1 ? 'mark' : 'marks'}`;
  });
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfAnnotationLayer,
    PendingMarks,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withSearch(),
      withAnnotation(),
      withRedaction(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './review.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="viewer">
        <epdf-stage #stage="epdfStage" class="stage">
          <ng-template epdfPage>
            <epdf-render-layer />
            <epdf-annotation-layer />
          </ng-template>
        </epdf-stage>
        <div demoPendingMarks [stage]="stage"></div>
      </div>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  private readonly redaction = inject(EpdfRedaction);
  private readonly annotation = inject(EpdfAnnotation);
  private started = false;

  constructor() {
    // On load: the author's name, and every "commercial" in the document.
    effect(() => {
      if (this.annotation.status() !== 'ready' || this.started) return;
      this.started = true;
      void this.redaction
        .markArea(0, { x: 100, y: 508, width: 172, height: 50 })
        .then(() => this.redaction.markMatches({ text: 'commercial' }));
    });
  }
}
