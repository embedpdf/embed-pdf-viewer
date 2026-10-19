import { Component } from '@angular/core';
import { EpdfFormLayer, withForm } from '@embedpdf/angular/form';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { provideEmbedPdf } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { engine } from './pdf';

@Component({
  selector: 'app-form-viewer',
  imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfFormLayer],
  providers: [provideEmbedPdf({ engine }, withStage(), withRender(), withInteraction(), withForm())],
  template: `
    <epdf-stage>
      <ng-template epdfPage>
        <epdf-render-layer />
        <epdf-form-layer />
      </ng-template>
    </epdf-stage>
  `,
})
export class FormViewer {}
