import { Component, inject, input } from '@angular/core';
import { annotationKey } from '@embedpdf/angular/annotation';
import { EpdfRedaction } from '@embedpdf/angular/redaction';
import type { EpdfStage } from '@embedpdf/angular/stage';

/** Next to `<epdf-stage #stage="epdfStage">`: `<app-pending-redactions [stage]="stage" />`. */
@Component({
  selector: 'app-pending-redactions',
  template: `
    <ul>
      @for (mark of redaction.pending(); track annotationKey(mark.ref)) {
        <li>
          <button (click)="stage().reveal(mark.page, { rect: mark.bounds })">
            Page {{ mark.pageIndex + 1 }}: {{ mark.kind === 'text' ? 'text' : 'area' }}
          </button>
          <button (click)="redaction.unmark([mark.ref])">Remove</button>
        </li>
      }
    </ul>
  `,
})
export class PendingRedactions {
  readonly stage = input.required<EpdfStage>();

  protected readonly redaction = inject(EpdfRedaction);
  protected readonly annotationKey = annotationKey;
}
