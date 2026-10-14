import { Component, inject } from '@angular/core';
import { EpdfAnnotation, EpdfAnnotationDraftMenu } from '@embedpdf/angular/annotation';

@Component({
  selector: 'app-draft-menu',
  imports: [EpdfAnnotationDraftMenu],
  template: `
    <epdf-annotation-draft-menu #menu="epdfAnnotationDraftMenu">
      <button [disabled]="!menu.draft()?.canFinish" (click)="annotation.draft.finish()">
        Done
      </button>
      <button (click)="annotation.draft.cancel()">Cancel</button>
    </epdf-annotation-draft-menu>
  `,
})
export class DraftMenu {
  protected readonly annotation = inject(EpdfAnnotation);
}
