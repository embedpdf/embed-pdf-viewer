import { Component, input } from '@angular/core';
import { EpdfDocumentScope } from '@embedpdf/angular/runtime';
import { EpdfRenderLayer } from '@embedpdf/angular/render';
import { EpdfPageTemplate, EpdfStage } from '@embedpdf/angular/stage';

@Component({
  selector: 'app-document-pane',
  imports: [EpdfDocumentScope, EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
  template: `
    <div [epdfDocumentScope]="documentId()">
      <epdf-stage>
        <ng-template epdfPage>
          <epdf-render-layer />
        </ng-template>
      </epdf-stage>
    </div>
  `,
})
export class DocumentPane {
  readonly documentId = input.required<string>();
}
