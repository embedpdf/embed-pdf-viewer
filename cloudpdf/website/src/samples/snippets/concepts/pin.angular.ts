import { Component } from '@angular/core';
import { EpdfRenderLayer } from '@embedpdf/angular/render';
import { EpdfPageTemplate, EpdfStage } from '@embedpdf/angular/stage';

@Component({
  selector: 'app-pages',
  imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
  template: `
    <epdf-stage>
      <ng-template epdfPage let-page>
        <epdf-render-layer />
        @for (point of pins.get(page.ref.objectNumber) ?? []; track $index) {
          <!-- page coordinates → pixels on this page, at its zoom; the page turns them with it -->
          @let at = page.transform().toPixels(point);
          <div style="position: absolute" [style.left.px]="at.x" [style.top.px]="at.y">📌</div>
        }
      </ng-template>
    </epdf-stage>
  `,
})
export class Pages {
  /** Your own data: points in page coordinates, by the page's object number. */
  protected readonly pins = new Map<number, { x: number; y: number }[]>();
}
