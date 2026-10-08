import { Component } from '@angular/core';
import { EpdfPdfViewer } from '@embedpdf/viewer-angular';
import { config } from './viewer-config';

@Component({
  selector: 'app-root',
  imports: [EpdfPdfViewer],
  template: `<epdf-pdf-viewer src="/report.pdf" [config]="config" style="height: 100vh" />`,
})
export class App {
  readonly config = config;
}
