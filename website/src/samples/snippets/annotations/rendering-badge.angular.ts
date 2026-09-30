import { NgTemplateOutlet } from '@angular/common';
import { Component } from '@angular/core';
import {
  EpdfAnnotationLayer,
  EpdfAnnotationTemplate,
  type Annotation,
} from '@embedpdf/angular/annotation';

@Component({
  selector: 'app-annotations',
  imports: [EpdfAnnotationLayer, EpdfAnnotationTemplate, NgTemplateOutlet],
  template: `
    <epdf-annotation-layer>
      <ng-template
        [epdfAnnotation]="isApproved"
        let-box="box"
        let-page="page"
        let-native="native"
        let-hovered="hovered"
      >
        @let rect = page.transform.pageToViewRect(box);
        <ng-container [ngTemplateOutlet]="native" />
        <div
          class="badge"
          [class.badge--hover]="hovered"
          style="position: absolute"
          [style.left.px]="rect.x + rect.width - 12"
          [style.top.px]="rect.y - 12"
        >
          ✓
        </div>
      </ng-template>
    </epdf-annotation-layer>
  `,
})
export class Annotations {
  protected readonly isApproved = (annotation: Annotation) =>
    annotation.subtype === 'stamp' && annotation.name === 'Approved';
}
