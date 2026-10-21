import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import {
  annotationKey,
  EpdfAnnotation,
  EpdfAnnotationLayer,
  withAnnotation,
} from '@embedpdf/angular/annotation';
import { localEngine } from '@embedpdf/engine';

const review = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-review.pdf');
  return { kind: 'bytes', id: 'review', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// The last annotation on a page is drawn on top.
@Component({
  selector: 'demo-order-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <button type="button" class="button" [disabled]="!single()" (click)="sendToBack()">
        Send to back
      </button>
      <button type="button" class="button" [disabled]="!single()" (click)="bringToFront()">
        Bring to front
      </button>
      <span class="spacer"></span>
      <output class="readout">{{ readout() }}</output>
    </div>
  `,
})
export class OrderControls {
  private readonly annotation = inject(EpdfAnnotation);
  private readonly first = computed(() => this.annotation.selected()[0]);
  protected readonly single = computed(() => this.annotation.selected().length === 1);
  private readonly onPage = this.annotation.watch(() => {
    const first = this.first();
    return first ? { pages: [first.page] } : undefined;
  });
  private readonly position = computed(() => {
    const first = this.first();
    if (!first) return -1;
    return this.onPage().findIndex((a) => annotationKey(a.ref) === annotationKey(first.ref));
  });
  protected readonly readout = computed(() =>
    this.position() >= 0
      ? `${this.position() + 1} of ${this.onPage().length}, from the back`
      : 'Select a rectangle',
  );

  protected sendToBack() {
    const first = this.first();
    if (first) void this.annotation.reorder([first.ref], 'start');
  }

  protected bringToFront() {
    const first = this.first();
    if (first) void this.annotation.reorder([first.ref], 'end');
  }
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfAnnotationLayer,
    OrderControls,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: review }] },
      withStage(),
      withRender(),
      withInteraction(),
      withAnnotation(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './order.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-order-controls />
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-annotation-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  private readonly annotation = inject(EpdfAnnotation);
  private readonly stage = viewChild(EpdfStage);
  private done = false;

  constructor() {
    // On load: the middle one of the document's three stacked rectangles, selected.
    effect(() => {
      const stage = this.stage();
      if (!stage || this.annotation.status() !== 'ready' || this.done) return;
      this.done = true;
      untracked(() => {
        const stack2 = this.annotation.list().find((each) => each.nm === 'stack-2');
        if (!stack2) return;
        this.annotation.selection.set([stack2.ref]);
        stage.reveal(stack2.page, { rect: stack2.rect });
      });
    });
  }
}
