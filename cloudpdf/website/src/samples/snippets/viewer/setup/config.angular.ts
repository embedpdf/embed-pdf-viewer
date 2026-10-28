import { Component } from '@angular/core';
import { EpdfPdfViewer, type Viewer } from '@cloudpdf/viewer-angular';

@Component({
  selector: 'app-report',
  imports: [EpdfPdfViewer],
  template: `
    <epdf-pdf-viewer
      [src]="{ shareToken: 'shr_gvpJcG1ULUMon19C0D1wODSY' }"
      theme="system"
      [disable]="['forms']"
      style="height: 100vh"
      (ready)="onReady($event)"
    />
  `,
})
export class Report {
  onReady(viewer: Viewer) {
    console.log('ready', viewer);
  }
}
