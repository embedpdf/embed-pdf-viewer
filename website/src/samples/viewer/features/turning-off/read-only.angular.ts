import { Component } from '@angular/core';
import { EpdfPdfViewer, type ViewerConfig } from '@embedpdf/viewer-angular';

const report = '/pdfs/report.pdf';

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
