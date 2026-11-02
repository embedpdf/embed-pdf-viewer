import { Component } from '@angular/core';
import { EpdfPdfViewer, type ViewerConfig } from '@cloudpdf/viewer-angular';

const welcome = { grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };
const article = { grant: 'shr_v09cJHOmj3C8vrfUlZNTDyqX' };
const report = { grant: 'shr__TWhIGdJtaKlcnVgJdg--bcm' };

@Component({
  selector: 'demo-root',
  imports: [EpdfPdfViewer],
  template: `<epdf-pdf-viewer [config]="config" style="height: 100%" />`,
})
export class App {
  readonly config: ViewerConfig = {
    documents: [
      { src: welcome, name: 'Welcome' },
      { src: article, name: 'Engineering blog' },
      { src: report, name: 'Q3 report', active: true },
    ],
  };
}
