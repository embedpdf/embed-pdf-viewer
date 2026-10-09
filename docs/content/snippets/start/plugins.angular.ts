import { Component } from '@angular/core';
import { provideEmbedPdf } from '@embedpdf/angular/runtime';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfSelectionLayer, withSelection } from '@embedpdf/angular/selection';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { engine } from './pdf';

@Component({
  selector: 'app-document-viewer',
  imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfSelectionLayer],
  providers: [
    provideEmbedPdf({ engine }, withStage(), withRender(), withInteraction(), withSelection()),
  ],
  template: `
    <epdf-stage>
      <ng-template epdfPage>
        <epdf-render-layer />
        <epdf-selection-layer />
      </ng-template>
    </epdf-stage>
  `,
})
export class DocumentViewer {}
