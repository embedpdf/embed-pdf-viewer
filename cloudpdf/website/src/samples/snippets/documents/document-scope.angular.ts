import { Component, input } from '@angular/core';
import { EpdfDocumentScope } from '@embedpdf/angular/runtime';
import { EpdfRenderLayer } from '@embedpdf/angular/render';
import { EpdfPageTemplate, EpdfStage } from '@embedpdf/angular/stage';
import { ZoomControls } from './zoom-controls';

@Component({
  selector: 'app-document-view',
  imports: [EpdfDocumentScope, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, ZoomControls],
  template: `
    <div [epdfDocumentScope]="documentId()">
      <epdf-stage>
        <ng-template epdfPage>
          <epdf-render-layer />
        </ng-template>
      </epdf-stage>
      <app-zoom-controls />
    </div>
  `,
})
export class DocumentView {
  readonly documentId = input.required<string>();
}
