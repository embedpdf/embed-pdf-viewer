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
      <ng-template [epdfAnnotation]="isNote" let-annotation let-hovered="hovered">
        <!-- It fills its frame (width and height 100% in your CSS), so the selection
             outline and the click area match it, and it turns with the annotation. -->
        <div class="bubble" [class.bubble--hover]="hovered">
          {{ annotation.author?.[0] ?? '?' }}
        </div>
      </ng-template>
    </epdf-annotation-layer>
  `,
})
export class Annotations {
  protected readonly isNote = (annotation: Annotation) => annotation.subtype === 'text';
}
