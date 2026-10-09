import { Component } from '@angular/core';
import { EpdfRenderLayer } from '@embedpdf/angular/render';
import { EpdfPageTemplate, EpdfStage } from '@embedpdf/angular/stage';

@Component({
  selector: 'app-clean-pages',
  imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
  template: `
    <epdf-stage>
      <ng-template epdfPage>
        <epdf-render-layer [annotations]="false" />
      </ng-template>
    </epdf-stage>
  `,
})
export class CleanPages {}
