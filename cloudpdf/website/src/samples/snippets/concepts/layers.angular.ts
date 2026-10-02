import { Component } from '@angular/core';
import { EpdfAnnotationLayer } from '@embedpdf/angular/annotation';
import { EpdfRenderLayer } from '@embedpdf/angular/render';
import { EpdfSearchLayer } from '@embedpdf/angular/search';
import { EpdfSelectionLayer } from '@embedpdf/angular/selection';
import { EpdfPageTemplate, EpdfStage } from '@embedpdf/angular/stage';

@Component({
  selector: 'app-pages',
  imports: [
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfSearchLayer,
    EpdfSelectionLayer,
    EpdfAnnotationLayer,
  ],
  template: `
    <epdf-stage>
      <ng-template epdfPage>
        <epdf-render-layer [annotations]="false" />
        <epdf-search-layer />
        <epdf-selection-layer />
        <epdf-annotation-layer />
      </ng-template>
    </epdf-stage>
  `,
})
export class Pages {}
