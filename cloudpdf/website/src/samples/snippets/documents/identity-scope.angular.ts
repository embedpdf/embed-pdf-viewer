import { Component } from '@angular/core';
import { provideEmbedPdf } from '@embedpdf/angular/runtime';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { engine } from './pdf';

@Component({
  selector: 'app-review-viewer',
  imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
  providers: [
    provideEmbedPdf(
      {
        engine,
        identity: { userId: 'u_381', displayName: 'Dana Smith' },
        scope: ['doc.open', 'doc.render', 'doc.text.select', 'doc.annotate.read', 'annotations:create:self'],
      },
      withStage(),
      withRender(),
    ),
  ],
  template: `
    <epdf-stage>
      <ng-template epdfPage>
        <epdf-render-layer />
      </ng-template>
    </epdf-stage>
  `,
})
export class ReviewViewer {}
