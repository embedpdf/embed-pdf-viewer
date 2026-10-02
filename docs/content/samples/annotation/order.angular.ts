import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
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
  withAnnotation,
} from '@embedpdf/angular/annotation';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

const COLORS = [
  { color: '#e5484d', fill: '#ffd1d3' },
  { color: '#30a46c', fill: '#c9f0da' },
  { color: '#1e90ff', fill: '#cfe6ff' },
];

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
    if (first) void this.annotation.move([first.ref], 0);
  }

  protected bringToFront() {
    const first = this.first();
    if (first) void this.annotation.move([first.ref], this.onPage().length - 1);
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
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
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
          <epdf-render-layer [annotations]="false" />
          <epdf-annotation-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  private readonly annotation = inject(EpdfAnnotation);
  private readonly pages = inject(EpdfDocument).pages;
  private added = false;

  constructor() {
    // On load: three filled rectangles stacked on the cover, the middle one selected.
    effect(() => {
      const cover = this.pages()[0]?.ref;
      if (this.annotation.status() !== 'ready' || !cover || this.added) return;
      this.added = true;
      COLORS.forEach(({ color, fill }, index) => {
        void this.annotation.create(
          cover,
          {
            subtype: 'square',
            box: { x: 300 + index * 50, y: 520 + index * 30, width: 160, height: 90 },
            color,
            interiorColor: fill,
            strokeWidth: 3,
          },
          undefined,
          { select: index === 1 },
        );
      });
    });
  }
}
