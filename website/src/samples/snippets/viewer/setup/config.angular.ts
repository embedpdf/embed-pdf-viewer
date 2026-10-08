import { Component } from '@angular/core';
import { EpdfPdfViewer, type Viewer } from '@embedpdf/viewer-angular';

@Component({
  selector: 'app-report',
  imports: [EpdfPdfViewer],
  template: `
    <epdf-pdf-viewer
      src="/report.pdf"
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
