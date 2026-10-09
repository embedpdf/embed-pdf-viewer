import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnnotation, EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// The top half of the cover, where the box selects.
const TOP_HALF = { x: 0, y: 0, width: 612, height: 396 };

@Component({
  selector: 'demo-selection-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <button type="button" class="button" [disabled]="!cover()" (click)="selectAll()">
        Everything on the cover
      </button>
      <button type="button" class="button" [disabled]="!cover()" (click)="selectTopHalf()">
        The top half
      </button>
      <button
        type="button"
        class="button"
        [disabled]="selected().length === 0"
        (click)="annotation.selection.clear()"
      >
        Clear
      </button>
      <span class="spacer"></span>
      <output class="readout">{{ selected().length }} selected</output>
    </div>
  `,
})
export class SelectionToolbar {
  protected readonly annotation = inject(EpdfAnnotation);
  private readonly document = inject(EpdfDocument);
  protected readonly selected = this.annotation.selected; // the selected annotations
  protected readonly cover = computed(() => this.document.pages()[0]?.ref);

  protected selectAll() {
    const cover = this.cover();
    if (cover) this.annotation.selection.selectAll(cover);
  }

  protected selectTopHalf() {
    const cover = this.cover();
    if (cover) this.annotation.selection.selectInRect(cover, TOP_HALF);
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
    SelectionToolbar,
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
  styleUrl: './select-code.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-selection-toolbar />
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
  private readonly document = inject(EpdfDocument);
  private added = false;

  constructor() {
    // On load: two shapes at the top of the cover, two at the bottom, and all four selected.
    effect(() => {
      const cover = this.document.pages()[0]?.ref;
      if (this.annotation.status() !== 'ready' || !cover || this.added) return;
      this.added = true;
      untracked(() => {
        void Promise.all([
          this.annotation.create(cover, {
            subtype: 'square',
            box: { x: 60, y: 40, width: 120, height: 50 },
            color: '#e5484d',
            strokeWidth: 3,
          }),
          this.annotation.create(cover, {
            subtype: 'circle',
            box: { x: 490, y: 200, width: 80, height: 80 },
            color: '#1e90ff',
            strokeWidth: 3,
          }),
          this.annotation.create(cover, {
            subtype: 'square',
            box: { x: 96, y: 506, width: 178, height: 54 },
            color: '#30a46c',
            strokeWidth: 3,
          }),
          this.annotation.create(cover, {
            subtype: 'text',
            rect: { x: 480, y: 640, width: 20, height: 20 },
            contents: 'A note at the bottom',
            color: '#facc15',
          }),
        ]).then(() => this.annotation.selection.selectAll(cover));
      });
    });
  }
}
