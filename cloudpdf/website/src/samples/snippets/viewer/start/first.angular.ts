import { Component } from '@angular/core';
import { EpdfPdfViewer } from '@cloudpdf/viewer-angular';

@Component({
  selector: 'app-root',
  imports: [EpdfPdfViewer],
  template: `<epdf-pdf-viewer [src]="{ shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' }" style="height: 100vh" />`,
})
export class App {}
