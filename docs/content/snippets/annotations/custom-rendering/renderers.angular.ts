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
      <ng-template [epdfAnnotation]="isNote" let-annotation>
        <!-- how this annotation looks: see below -->
      </ng-template>
    </epdf-annotation-layer>
  `,
})
export class Annotations {
  protected readonly isNote = (annotation: Annotation) => annotation.subtype === 'text';
}
