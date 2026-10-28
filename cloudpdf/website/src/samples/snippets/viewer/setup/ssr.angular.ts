import { Component } from '@angular/core';
import { EpdfPdfViewer } from '@cloudpdf/viewer-angular';

@Component({
  selector: 'app-report',
  imports: [EpdfPdfViewer],
  template: `
    @defer (on viewport) {
      <epdf-pdf-viewer [src]="{ shareToken: 'shr_gvpJcG1ULUMon19C0D1wODSY' }" style="height: 100vh" />
    } @placeholder {
      <div style="height: 100vh"></div>
    }
  `,
})
export class Report {}
