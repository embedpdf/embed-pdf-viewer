import { Component } from '@angular/core';
import { EpdfAnnotationLayer, EpdfHandleTemplate } from '@embedpdf/angular/annotation';

@Component({
  selector: 'app-annotations',
  imports: [EpdfAnnotationLayer, EpdfHandleTemplate],
  template: `
    <epdf-annotation-layer>
      <ng-template epdfHandle let-handle>
        <div
          class="my-handle"
          [style.left.px]="handle.at.x - handle.size / 2"
          [style.top.px]="handle.at.y - handle.size / 2"
          [style.width.px]="handle.size"
          [style.height.px]="handle.size"
          [style.rotate.deg]="handle.rotation"
        ></div>
      </ng-template>
      <!-- <ng-template epdfRotationHandle> works the same way -->
    </epdf-annotation-layer>
  `,
})
export class Annotations {}
