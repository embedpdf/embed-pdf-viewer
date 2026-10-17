import { Component, inject } from '@angular/core';
import { EpdfSelection } from '@embedpdf/angular/selection';

@Component({
  selector: 'app-highlight-button',
  template: `<button [disabled]="!selection.hasSelection()">Highlight</button>`,
})
export class HighlightButton {
  // selection.hasSelection(), selection.isSelecting(), selection.pages()
  protected readonly selection = inject(EpdfSelection);
}
