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
import {
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

@Component({
  selector: 'demo-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <p class="hint">{{ text() }}</p>
    </div>
  `,
})
export class Status {
  private readonly annotation = inject(EpdfAnnotation);

  protected readonly text = computed(() => {
    const selected = this.annotation.selected();
    if (this.annotation.status() === 'loading') return 'Loading the annotations…';
    if (selected.length > 0) return `Selected: ${selected.map((a) => a.subtype).join(', ')}`;
    return 'Click an annotation to select it';
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
    Status,
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
  styleUrl: './layer.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-status />
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
    // On load: a highlight, a rectangle, a sticky note and a text box on the cover.
    effect(() => {
      const cover = this.document.pages()[0]?.ref;
      if (this.annotation.status() !== 'ready' || !cover || this.added) return;
      this.added = true;
      untracked(() => {
        void this.annotation.create(cover, {
          subtype: 'highlight',
          quadPoints: [
            {
              upperLeft: { x: 106, y: 218 },
              upperRight: { x: 458, y: 218 },
              lowerLeft: { x: 106, y: 267 },
              lowerRight: { x: 458, y: 267 },
            },
          ],
          color: '#ffcd45',
        });
        void this.annotation.create(cover, {
          subtype: 'square',
          box: { x: 96, y: 506, width: 178, height: 54 },
          color: '#e5484d',
          strokeWidth: 3,
        });
        void this.annotation.create(cover, {
          subtype: 'text',
          rect: { x: 470, y: 232, width: 20, height: 20 },
          contents: 'A good title',
          color: '#facc15',
        });
        void this.annotation.create(cover, {
          subtype: 'free-text',
          box: { x: 300, y: 512, width: 230, height: 40 },
          contents: 'Double-click to type here',
          fontSize: 16,
          fontColor: '#1a2748',
          interiorColor: '#fffbe6',
        });
      });
    });
  }
}
