import { Component } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { getToken } from './auth';
import { engine } from './pdf';

@Component({
  selector: 'app-contract-viewer',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
  providers: [
    provideEmbedPdf(
      {
        engine,
        initialDocuments: [{ source: { kind: 'url', url: '/api/files/contract.pdf' } }],
        fetch: (url, init) =>
          fetch(url, { ...init, headers: { Authorization: `Bearer ${getToken()}` } }),
      },
      withStage(),
      withRender(),
    ),
  ],
  template: `
    <epdf-stage *epdfDocumentGate="let document">
      <ng-template epdfPage>
        <epdf-render-layer />
      </ng-template>
    </epdf-stage>
  `,
})
export class ContractViewer {}
