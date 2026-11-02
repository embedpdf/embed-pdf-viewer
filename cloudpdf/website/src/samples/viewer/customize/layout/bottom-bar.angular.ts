import { Component } from '@angular/core';
import { EpdfPdfViewer, type ViewerConfig } from '@cloudpdf/viewer-angular';

const welcome = { grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };

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
