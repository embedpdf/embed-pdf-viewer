import { Component } from '@angular/core';
import { EpdfRenderLayer } from '@embedpdf/angular/render';
import { EpdfPageTemplate, EpdfScrollbar, EpdfStage } from '@embedpdf/angular/stage';

@Component({
  selector: 'app-pages',
  imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfScrollbar],
  template: `
    <epdf-stage>
      <ng-template epdfPage>
        <epdf-render-layer />
      </ng-template>

      <!-- Inside the Stage, over its pages -->
      <epdf-scrollbar axis="y" />
    </epdf-stage>
  `,
})
export class Pages {}
