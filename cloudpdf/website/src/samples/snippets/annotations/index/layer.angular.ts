import { Component } from '@angular/core';
import { EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { provideEmbedPdf } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';

import { engine } from './setup';

@Component({
  selector: 'app-document-view',
  imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfAnnotationLayer],
  providers: [
    provideEmbedPdf({ engine }, withStage(), withRender(), withInteraction(), withAnnotation()),
  ],
  template: `
    <epdf-stage>
      <ng-template epdfPage>
        <epdf-render-layer [annotations]="false" />
        <epdf-annotation-layer />
      </ng-template>
    </epdf-stage>
  `,
})
export class DocumentView {}
