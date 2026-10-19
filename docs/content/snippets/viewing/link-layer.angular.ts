import { Component } from '@angular/core';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfLinkLayer, withLink } from '@embedpdf/angular/link';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { provideEmbedPdf } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { engine } from './pdf';

@Component({
  selector: 'app-reader',
  imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfLinkLayer],
  providers: [provideEmbedPdf({ engine }, withStage(), withRender(), withInteraction(), withLink())],
  template: `
    <epdf-stage>
      <ng-template epdfPage>
        <epdf-render-layer />
        <epdf-link-layer />
      </ng-template>
    </epdf-stage>
  `,
})
export class Reader {}
