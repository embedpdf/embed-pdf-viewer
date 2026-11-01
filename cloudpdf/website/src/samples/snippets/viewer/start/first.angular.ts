import { Component } from '@angular/core';
import { EpdfPdfViewer } from '@cloudpdf/viewer-angular';

@Component({
  selector: 'app-root',
  imports: [EpdfPdfViewer],
  template: `<epdf-pdf-viewer [src]="{ grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' }" style="height: 100vh" />`,
})
export class App {}
