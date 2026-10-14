import { Component } from '@angular/core';
import { EpdfRenderLayer } from '@embedpdf/angular/render';
import { EpdfPageTemplate, EpdfStage } from '@embedpdf/angular/stage';

@Component({
  selector: 'app-pages',
  imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
  template: `
    <epdf-stage>
      <ng-template epdfPage>
        <!-- Drawn once on every page -->
        <epdf-render-layer />
      </ng-template>
    </epdf-stage>
  `,
})
export class Pages {}
