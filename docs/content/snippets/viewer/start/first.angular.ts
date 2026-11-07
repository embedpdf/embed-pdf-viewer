import { Component } from '@angular/core';
import { EpdfPdfViewer } from '@embedpdf/viewer-angular';

@Component({
  selector: 'app-root',
  imports: [EpdfPdfViewer],
  template: `<epdf-pdf-viewer
    src="https://www.embedpdf.com/pdfs/welcome.pdf"
    style="height: 100vh"
  />`,
})
export class App {}
