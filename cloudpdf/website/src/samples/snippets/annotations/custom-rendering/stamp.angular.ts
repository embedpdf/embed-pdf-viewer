import { NgTemplateOutlet } from '@angular/common';
import { Component, inject } from '@angular/core';
import {
  EpdfAnnotationLayer,
  EpdfAnnotationTemplate,
  annotationKey,
  type Annotation,
} from '@embedpdf/angular/annotation';
import { Approvals, StatusDot } from './approvals'; // your own data and UI

@Component({
  selector: 'app-annotations',
  imports: [EpdfAnnotationLayer, EpdfAnnotationTemplate, NgTemplateOutlet, StatusDot],
  template: `
    <epdf-annotation-layer>
      <ng-template
        [epdfAnnotation]="isApproved"
        [epdfAnnotationInteractive]="inReadingMode"
        let-annotation
        let-box="box"
        let-page="page"
        let-native="native"
        let-interactive="interactive"
      >
        @let approval = approvals.get(key(annotation.ref));
        @let rect = page.transform.pageToViewRect(box);
        <div
          style="position: absolute"
          [style.left.px]="rect.x"
          [style.top.px]="rect.y"
          [style.width.px]="rect.width"
          [style.height.px]="rect.height"
        >
          <ng-container [ngTemplateOutlet]="native" />
          <app-status-dot [status]="approval.status" />
          @if (interactive) {
            <button (click)="approval.open()">Details</button>
          }
        </div>
      </ng-template>
    </epdf-annotation-layer>
  `,
})
export class Annotations {
  protected readonly approvals = inject(Approvals); // your own data
  protected readonly key = annotationKey;

  protected readonly isApproved = (annotation: Annotation) =>
    annotation.subtype === 'stamp' && annotation.name === 'Approved';
  protected readonly inReadingMode = ({ toolId }: { toolId: string }) => toolId === 'pan';
}
