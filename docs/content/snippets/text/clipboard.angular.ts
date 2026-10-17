import { Component } from '@angular/core';
import { EpdfSelectionClipboard } from '@embedpdf/angular/selection';

@Component({
  selector: 'app-clipboard',
  imports: [EpdfSelectionClipboard],
  // Once per document view: Ctrl+C / Cmd+C and the browser's Copy menu
  template: `<epdf-selection-clipboard />`,
})
export class Clipboard {}
