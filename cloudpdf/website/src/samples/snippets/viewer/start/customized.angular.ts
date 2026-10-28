import { Component } from '@angular/core';
import { EpdfPdfViewer } from '@cloudpdf/viewer-angular';
import { config } from './viewer-config';

@Component({
  selector: 'app-root',
  imports: [EpdfPdfViewer],
  template: `<epdf-pdf-viewer [src]="{ shareToken: 'shr_gvpJcG1ULUMon19C0D1wODSY' }" [config]="config" style="height: 100vh" />`,
})
export class App {
  readonly config = config;
}
