import { Component, inject, input } from '@angular/core';
import { EpdfAnnotation, type AnnotationRef } from '@embedpdf/angular/annotation';
import { DrawingTools } from './drawing-tools';

@Component({
  selector: 'app-annotation-actions',
  imports: [DrawingTools],
  template: `
    @if (annotation.canCreate()) {
      <app-drawing-tools />
    }
    <button [disabled]="!annotation.canDelete(annotationRef())">Delete</button>
  `,
})
export class AnnotationActions {
  readonly annotationRef = input.required<AnnotationRef>();

  protected readonly annotation = inject(EpdfAnnotation);
}
