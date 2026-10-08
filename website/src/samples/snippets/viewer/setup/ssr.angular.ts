import { Component } from '@angular/core';
import { EpdfPdfViewer } from '@embedpdf/viewer-angular';

@Component({
  selector: 'app-report',
  imports: [EpdfPdfViewer],
  template: `
    @defer (on viewport) {
      <epdf-pdf-viewer src="/report.pdf" style="height: 100vh" />
    } @placeholder {
      <div style="height: 100vh"></div>
    }
  `,
})
export class Report {}
