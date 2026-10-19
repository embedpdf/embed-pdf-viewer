import { Component } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { engine, source } from './pdf';
import { Toolbar } from './toolbar';

@Component({
  selector: 'app-viewer',
  imports: [Toolbar, EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
  providers: [
    provideEmbedPdf({ engine, initialDocuments: [{ source }] }, withStage(), withRender()),
  ],
  template: `
    <app-toolbar />
    <epdf-stage *epdfDocumentGate="let document; fallback: opening">
      <ng-template epdfPage>
        <epdf-render-layer />
      </ng-template>
    </epdf-stage>

    <ng-template #opening><p>Opening…</p></ng-template>
  `,
})
export class ViewerPage {}
