import { Component } from '@angular/core';
import { EpdfPdfViewer, type ViewerConfig } from '@embedpdf/viewer-angular';

// [!doc-source links]
const links = '/pdfs/links.pdf';
// [!/doc-source]

@Component({
  selector: 'demo-root',
  imports: [EpdfPdfViewer],
  template: `<epdf-pdf-viewer [src]="links" [config]="config" style="height: 100%" />`,
})
export class App {
  readonly links = links;
  readonly config: ViewerConfig = {
    plugins: {
      stage: { spread: 'odd', zoom: { mode: 'fit-width' } },
      selection: { color: 'rgb(124 58 237 / 0.3)' },
    },
  };
}
