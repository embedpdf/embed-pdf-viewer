import { Component, inject, viewChild } from '@angular/core';
import {
  EpdfAnnotation,
  EpdfAnnotationLayer,
  EpdfComments,
  annotationKey,
  type CommentThread,
} from '@embedpdf/angular/annotation';
import { EpdfRenderLayer } from '@embedpdf/angular/render';
import { EpdfPageTemplate, EpdfStage } from '@embedpdf/angular/stage';

@Component({
  selector: 'app-review',
  imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfAnnotationLayer],
  template: `
    <epdf-stage>
      <ng-template epdfPage>
        <epdf-render-layer />
        <epdf-annotation-layer />
      </ng-template>
    </epdf-stage>

    @for (thread of comments.threads(); track key(thread.root.ref)) {
      <button (click)="show(thread)">{{ thread.root.contents }}</button>
    }
  `,
})
export class Review {
  private readonly stage = viewChild.required(EpdfStage);
  private readonly annotation = inject(EpdfAnnotation);
  protected readonly comments = inject(EpdfComments);
  protected readonly key = annotationKey;

  protected show(thread: CommentThread) {
    this.stage().reveal(thread.page, { rect: thread.root.rect });
    this.annotation.selection.set([thread.root.ref]); // and select it
  }
}
