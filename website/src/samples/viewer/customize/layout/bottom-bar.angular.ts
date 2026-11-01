import { Component } from '@angular/core';
import { EpdfPdfViewer, type ViewerConfig } from '@embedpdf/viewer-angular';

const welcome = '/pdfs/welcome.pdf';

@Component({
  selector: 'demo-root',
  imports: [EpdfPdfViewer],
  template: `<epdf-pdf-viewer [src]="welcome" [config]="config" style="height: 100%" />`,
})
export class App {
  readonly welcome = welcome;
  readonly config: ViewerConfig = {
    layout: (layout) =>
      layout
        .place('main', 'bottom')
        .remove('zoom', { from: 'main' })
        .addBar('zoom', {
          place: { float: 'bottom-end' },
          center: [[{ custom: 'zoom' }]],
        }),
  };
}
