import { Component } from '@angular/core';
import { EpdfPdfViewer, type Viewer } from '@embedpdf/viewer-angular';

@Component({
  selector: 'app-root',
  imports: [EpdfPdfViewer],
  template: `<epdf-pdf-viewer
    src="https://www.embedpdf.com/pdfs/welcome.pdf"
    style="height: 100vh"
    (ready)="onReady($event)"
  />`,
})
export class App {
  onReady(viewer: Viewer) {
    viewer.documents.onOpened(() => viewer.get('search').search({ text: 'total' }));
  }
}
