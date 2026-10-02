import { Component } from '@angular/core';
import { EpdfAnnotationLayer } from '@embedpdf/angular/annotation';
import { EpdfRenderLayer } from '@embedpdf/angular/render';
import { EpdfPageTemplate, EpdfStage } from '@embedpdf/angular/stage';

@Component({
  selector: 'app-editable-pages',
  imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfAnnotationLayer],
  template: `
    <epdf-stage>
      <ng-template epdfPage>
        <epdf-render-layer [annotations]="false" />
        <epdf-annotation-layer />
      </ng-template>
    </epdf-stage>
  `,
})
export class EditablePages {}
