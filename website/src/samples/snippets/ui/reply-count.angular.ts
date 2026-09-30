import { Component, inject, input } from '@angular/core';
import { EpdfAnchored } from '@embedpdf/angular/anchored';
import { type Annotation, EpdfAnnotation, EpdfComments } from '@embedpdf/angular/annotation';

@Component({
  selector: 'app-reply-count',
  imports: [EpdfAnchored],
  template: `
    <epdf-anchored [anchor]="anchor()" placement="right" [gap]="4">
      <span class="badge">{{ thread()?.replies.length ?? 0 }}</span>
    </epdf-anchored>
  `,
})
export class ReplyCount {
  readonly note = input.required<Annotation>();

  protected readonly anchor = inject(EpdfAnnotation).anchorOf(() => this.note().ref);
  protected readonly thread = inject(EpdfComments).threadOf(() => this.note().ref);
}
