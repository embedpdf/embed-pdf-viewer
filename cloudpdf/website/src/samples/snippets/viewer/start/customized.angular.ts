import { Component } from '@angular/core';
import { EpdfPdfViewer } from '@cloudpdf/viewer-angular';
import { config } from './viewer-config';

@Component({
  selector: 'app-root',
  imports: [EpdfPdfViewer],
  template: `<epdf-pdf-viewer [src]="{ shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' }" [config]="config" style="height: 100vh" />`,
})
export class App {
  readonly config = config;
}
