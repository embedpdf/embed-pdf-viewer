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
      <ng-template [epdfAnnotation]="isApproved" let-annotation>
        <!-- how this annotation looks: see below -->
      </ng-template>
    </epdf-annotation-layer>
  `,
})
export class Annotations {
  protected readonly isApproved = (annotation: Annotation) =>
    annotation.subtype === 'stamp' && annotation.name === 'Approved';
}
