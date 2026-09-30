import { Component } from '@angular/core';
import {
  EpdfAnnotationLayer,
  EpdfAnnotationTemplate,
  type Annotation,
} from '@embedpdf/angular/annotation';
import { ApprovalWidget } from './approval-widget';

@Component({
  selector: 'app-annotations',
  imports: [EpdfAnnotationLayer, EpdfAnnotationTemplate, ApprovalWidget],
  template: `
    <epdf-annotation-layer>
      <ng-template [epdfAnnotation]="isApproved" epdfAnnotationInteractive let-annotation>
        <app-approval-widget [annotation]="annotation" />
      </ng-template>
    </epdf-annotation-layer>
  `,
})
export class Annotations {
  protected readonly isApproved = (annotation: Annotation) =>
    annotation.subtype === 'stamp' && annotation.name === 'Approved';
}
