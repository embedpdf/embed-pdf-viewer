import { Component, inject, input } from '@angular/core';
import { EpdfComments, annotationKey } from '@embedpdf/angular/annotation';
import type { EpdfStage } from '@embedpdf/angular/stage';

/** Next to `<epdf-stage #stage="epdfStage">`: `<app-thread-links [stage]="stage" />`. */
@Component({
  selector: 'app-thread-links',
  template: `
    @for (thread of comments.threads(); track annotationKey(thread.root.ref)) {
      <button (click)="stage().reveal(thread.page, { rect: thread.root.rect })">
        {{ thread.root.contents }}, page {{ thread.pageLabel }}
      </button>
    }
  `,
})
export class ThreadLinks {
  readonly stage = input.required<EpdfStage>();

  protected readonly comments = inject(EpdfComments);
  protected readonly annotationKey = annotationKey;
}
