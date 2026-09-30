import { PercentPipe } from '@angular/common';
import { Component } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf, type OpenInput } from '@embedpdf/angular/runtime';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfSelectionLayer, withSelection } from '@embedpdf/angular/selection';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

@Component({
  selector: 'app-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfSelectionLayer,
    PercentPipe,
  ],
  providers: [
    provideEmbedPdf(
      {
        engine: () => localEngine(),
        initialDocuments: [{ source: ebook }],
      },
      withStage(),
      withRender(),
      withInteraction(),
      withSelection(),
    ),
  ],
  template: `
    <section *epdfDocumentGate>
      <div>
        <button (click)="stage.zoomOut()">−</button>
        <span>{{ stage.zoomLevel() | percent }}</span>
        <button (click)="stage.zoomIn()">+</button>
      </div>

      <epdf-stage #stage="epdfStage" style="height: 500px">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-selection-layer />
        </ng-template>
      </epdf-stage>
    </section>
  `,
})
export class App {}
