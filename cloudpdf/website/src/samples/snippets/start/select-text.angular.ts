import { Component } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf, type OpenInput } from '@embedpdf/angular/runtime';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfSelectionLayer, withSelection } from '@embedpdf/angular/selection';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

@Component({
  selector: 'app-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfSelectionLayer],
  providers: [
    provideEmbedPdf(
      {
        engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }),
        initialDocuments: [{ source: ebook }],
      },
      withStage(),
      withRender(),
      withInteraction(),
      withSelection(),
    ),
  ],
  template: `
    <epdf-stage *epdfDocumentGate style="height: 500px">
      <ng-template epdfPage>
        <epdf-render-layer />
        <epdf-selection-layer />
      </ng-template>
    </epdf-stage>
  `,
})
export class App {}
