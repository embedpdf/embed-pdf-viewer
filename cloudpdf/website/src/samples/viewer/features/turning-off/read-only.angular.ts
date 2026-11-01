import { Component } from '@angular/core';
import { EpdfPdfViewer, type ViewerConfig } from '@cloudpdf/viewer-angular';

const report = { grant: 'shr__TWhIGdJtaKlcnVgJdg--bcm' };

@Component({
  selector: 'demo-root',
  imports: [EpdfPdfViewer],
  template: `<epdf-pdf-viewer [src]="report" [config]="config" style="height: 100%" />`,
})
export class App {
  readonly report = report;
  readonly config: ViewerConfig = {
    readOnly: true,
    disable: ['documents.download', 'documents.print'],
  };
}
