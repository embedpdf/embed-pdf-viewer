import { Component } from '@angular/core';
import { EpdfPdfViewer, type ViewerConfig } from '@cloudpdf/viewer-angular';

const article = { grant: 'shr_v09cJHOmj3C8vrfUlZNTDyqX' };

@Component({
  selector: 'demo-root',
  imports: [EpdfPdfViewer],
  template: `<epdf-pdf-viewer [src]="article" [config]="config" style="height: 100%" />`,
})
export class App {
  readonly article = article;
  readonly config: ViewerConfig = {
    plugins: {
      annotation: {
        tools: [
          { id: 'highlight', defaults: { color: '#fde047', opacity: 0.4 } },
          { id: 'ink', defaults: { color: '#1d4ed8', strokeWidth: 2 } },
        ],
      },
    },
  };
}
