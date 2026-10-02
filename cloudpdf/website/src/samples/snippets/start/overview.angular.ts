import { Component } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { cloudEngine } from '@cloudpdf/engine';

@Component({
  selector: 'app-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
  providers: [
    provideEmbedPdf(
      {
        engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }),
        initialDocuments: [{ source: { kind: 'url', url: '/contract.pdf' } }],
      },
      withStage(),
      withRender(),
    ),
  ],
  template: `
    <epdf-stage *epdfDocumentGate="let document; fallback: opening" style="height: 600px">
      <ng-template epdfPage>
        <epdf-render-layer />
      </ng-template>
    </epdf-stage>

    <ng-template #opening><p>Opening…</p></ng-template>
  `,
})
export class App {}
