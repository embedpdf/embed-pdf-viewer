import { Component, computed, input } from '@angular/core';
import { provideEmbedPdf } from '@embedpdf/angular/runtime';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { fetchDocumentToken } from './api';
import { engine } from './pdf';

@Component({
  selector: 'app-document-viewer',
  imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
  providers: [provideEmbedPdf({ engine }, withStage(), withRender())],
  template: `
    <epdf-stage [document]="source()">
      <ng-template epdfPage>
        <epdf-render-layer />
      </ng-template>
    </epdf-stage>
  `,
})
export class DocumentViewer {
  readonly documentId = input.required<string>();

  protected readonly source = computed(() => {
    const id = this.documentId();
    return { kind: 'token' as const, token: () => fetchDocumentToken(id) };
  });
}
