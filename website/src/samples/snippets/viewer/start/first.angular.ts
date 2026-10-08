import { Component } from '@angular/core';
import { EpdfPdfViewer } from '@embedpdf/viewer-angular';

@Component({
  selector: 'app-root',
  imports: [EpdfPdfViewer],
  template: `<epdf-pdf-viewer src="/report.pdf" style="height: 100vh" />`,
})
export class App {}
