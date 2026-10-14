import { Component, inject } from '@angular/core';
import { EpdfSelection, copySelection } from '@embedpdf/angular/selection';

@Component({
  selector: 'app-copy-button',
  template: `
    <button [disabled]="!selection.hasSelection() || !selection.canCopy()" (click)="copy()">
      Copy
    </button>
  `,
})
export class CopyButton {
  protected readonly selection = inject(EpdfSelection);

  protected copy() {
    void copySelection(this.selection);
  }
}
