import { Component } from '@angular/core';
import { EpdfPdfViewer, type ViewerConfig } from '@embedpdf/viewer-angular';

// [!doc-source welcome]
const welcome = 'https://www.embedpdf.com/pdfs/welcome.pdf';
// [!/doc-source]
// [!doc-source article]
const article = 'https://www.embedpdf.com/pdfs/article.pdf';
// [!/doc-source]
// [!doc-source report]
const report = 'https://www.embedpdf.com/pdfs/report.pdf';
// [!/doc-source]

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
