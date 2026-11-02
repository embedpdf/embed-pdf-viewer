import { Component } from '@angular/core';
import { EpdfPdfViewer, type ViewerConfig } from '@embedpdf/viewer-angular';

const welcome = '/pdfs/welcome.pdf';
const article = '/pdfs/article.pdf';
const report = '/pdfs/report.pdf';

@Component({
  selector: 'demo-root',
  imports: [EpdfPdfViewer],
  template: `<epdf-pdf-viewer [config]="config" style="height: 100%" />`,
})
export class App {
  readonly config: ViewerConfig = {
    documents: [
      { src: welcome, name: 'Welcome' },
      { src: article, name: 'Engineering blog' },
      { src: report, name: 'Q3 report', active: true },
    ],
  };
}
