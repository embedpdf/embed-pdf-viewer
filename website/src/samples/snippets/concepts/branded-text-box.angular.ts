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
      <ng-template [epdfAnnotation]="isTextBox" let-annotation>
        <!-- The element fills its frame (width and height 100% in your CSS). -->
        <div
          [epdfRichTextEditor]="annotation"
          #editor="epdfRichTextEditor"
          class="text-box"
          [class.editing]="editor.editing()"
        ></div>
      </ng-template>
    </epdf-annotation-layer>
  `,
})
export class Annotations {
  protected readonly isTextBox = (annotation: Annotation) => annotation.subtype === 'free-text';
}
