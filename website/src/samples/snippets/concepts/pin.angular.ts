import { Component } from '@angular/core';
import {
  EpdfAnnotationLayer,
  EpdfAnnotationTemplate,
  type Annotation,
} from '@embedpdf/angular/annotation';

@Component({
  selector: 'app-annotations',
  imports: [EpdfAnnotationLayer, EpdfAnnotationTemplate],
  template: `
    <epdf-annotation-layer>
      <ng-template [epdfAnnotation]="isNote" let-box="box" let-page="page">
        <!-- page coordinates → this page's pixels, zoom and rotation included -->
        @let point = page.transform.pageToView({ x: box.x, y: box.y });
        <div style="position: absolute" [style.left.px]="point.x" [style.top.px]="point.y">📌</div>
      </ng-template>
    </epdf-annotation-layer>
  `,
})
export class Annotations {
  protected readonly isNote = (annotation: Annotation) => annotation.subtype === 'text';
}
