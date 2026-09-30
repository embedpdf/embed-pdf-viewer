import { Component, inject } from '@angular/core';
import { EpdfStage } from '@embedpdf/angular/stage';

/** Floats over the pages: put it inside `<epdf-stage>`, which it injects. */
@Component({
  selector: 'app-page-navigation',
  template: `
    <nav>
      <button (click)="stage.previousPage()">Previous</button>
      <span>{{ stage.currentPageIndex() + 1 }} of {{ stage.pageCount() }}</span>
      <button (click)="stage.nextPage()">Next</button>
    </nav>
  `,
})
export class PageNavigation {
  protected readonly stage = inject(EpdfStage);
}
