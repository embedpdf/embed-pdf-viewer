import { PercentPipe } from '@angular/common';
import { Component } from '@angular/core';
import { EpdfRenderLayer } from '@embedpdf/angular/render';
import { EpdfPageTemplate, EpdfStage } from '@embedpdf/angular/stage';

@Component({
  selector: 'app-zoom',
  imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer, PercentPipe],
  template: `
    <div>
      <button (click)="stage.zoomOut()">−</button>
      <span>{{ stage.zoomLevel() | percent }}</span>
      <button (click)="stage.zoomIn()">+</button>
      <button (click)="stage.fitWidth()" [attr.aria-pressed]="stage.zoomMode() === 'fit-width'">
        Fit width
      </button>
    </div>

    <epdf-stage #stage="epdfStage">
      <ng-template epdfPage>
        <epdf-render-layer />
      </ng-template>
    </epdf-stage>
  `,
})
export class Zoom {}
