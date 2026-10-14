import { Component } from '@angular/core';
import { EpdfRenderLayer } from '@embedpdf/angular/render';
import {
  EpdfSelectionHandles,
  EpdfSelectionLayer,
  EpdfSelectionMenu,
} from '@embedpdf/angular/selection';
import { EpdfPageTemplate, EpdfStage } from '@embedpdf/angular/stage';

import { CopyButton } from './copy-button';

@Component({
  selector: 'app-pages',
  imports: [
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfSelectionLayer,
    EpdfSelectionMenu,
    EpdfSelectionHandles,
    CopyButton,
  ],
  template: `
    <epdf-stage>
      <ng-template epdfPage>
        <epdf-render-layer />
        <epdf-selection-layer />
      </ng-template>

      <epdf-selection-menu>
        <app-copy-button />
      </epdf-selection-menu>
      <epdf-selection-handles />
    </epdf-stage>
  `,
})
export class Pages {}
