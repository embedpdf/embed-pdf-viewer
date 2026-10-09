import { Component } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { fetchDocumentToken } from './api';
import { engine } from './pdf';
import { Spinner } from './spinner';

@Component({
  selector: 'app-contract-viewer',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, Spinner],
  providers: [
    provideEmbedPdf(
      {
        engine,
        initialDocuments: [{ source: { kind: 'token', token: () => fetchDocumentToken('contract') } }],
      },
      withStage(),
      withRender(),
    ),
  ],
  template: `
    <epdf-stage *epdfDocumentGate="let document; fallback: opening">
      <ng-template epdfPage>
        <epdf-render-layer />
      </ng-template>
    </epdf-stage>

    <ng-template #opening><app-spinner /></ng-template>
  `,
})
export class ContractViewer {}
