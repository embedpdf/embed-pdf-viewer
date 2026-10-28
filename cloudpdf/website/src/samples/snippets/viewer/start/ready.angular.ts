import { Component } from '@angular/core';
import { EpdfPdfViewer, type Viewer } from '@cloudpdf/viewer-angular';

@Component({
  selector: 'app-root',
  imports: [EpdfPdfViewer],
  template: `<epdf-pdf-viewer [src]="{ shareToken: 'shr_gvpJcG1ULUMon19C0D1wODSY' }" style="height: 100vh" (ready)="onReady($event)" />`,
})
export class App {
  onReady(viewer: Viewer) {
    viewer.documents.onOpened(() => viewer.get('search').search({ text: 'total' }));
  }
}
