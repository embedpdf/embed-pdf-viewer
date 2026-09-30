import { Component } from '@angular/core';
import {
  EpdfAnnotationLayer,
  EpdfAnnotationTemplate,
  EpdfRichTextEditor,
  type Annotation,
} from '@embedpdf/angular/annotation';

@Component({
  selector: 'app-annotations',
  imports: [EpdfAnnotationLayer, EpdfAnnotationTemplate, EpdfRichTextEditor],
  template: `
    <epdf-annotation-layer>
      <ng-template [epdfAnnotation]="isTextBox" let-annotation let-box="box" let-page="page">
        @let rect = page.transform.pageToViewRect(box);
        <div
          [epdfRichTextEditor]="annotation"
          #editor="epdfRichTextEditor"
          class="text-box"
          [class.editing]="editor.editing()"
          style="position: absolute"
          [style.left.px]="rect.x"
          [style.top.px]="rect.y"
          [style.width.px]="rect.width"
          [style.height.px]="rect.height"
        ></div>
      </ng-template>
    </epdf-annotation-layer>
  `,
})
export class Annotations {
  protected readonly isTextBox = (annotation: Annotation) => annotation.subtype === 'free-text';
}
