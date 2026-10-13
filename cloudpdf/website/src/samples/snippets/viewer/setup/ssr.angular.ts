import { Component } from '@angular/core';
import { EpdfPdfViewer } from '@cloudpdf/viewer-angular';

@Component({
  selector: 'app-report',
  imports: [EpdfPdfViewer],
  template: `
    @defer (on viewport) {
      <epdf-pdf-viewer [src]="{ shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' }" style="height: 100vh" />
    } @placeholder {
      <div style="height: 100vh"></div>
    }
  `,
})
export class Report {}
