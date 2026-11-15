import { Component } from '@angular/core';
import { EpdfPdfViewer, type ViewerConfig } from '@embedpdf/viewer-angular';

const registration = 'https://www.embedpdf.com/pdfs/registration.pdf';

@Component({
  selector: 'demo-root',
  imports: [EpdfPdfViewer],
  template: `<epdf-pdf-viewer [src]="registration" [config]="config" style="height: 100%" />`,
})
export class App {
  readonly registration = registration;
  readonly config: ViewerConfig = {
    plugins: {
      stamp: {
        libraries: [{ id: 'marks', url: 'https://www.embedpdf.com/pdfs/marks.pdf' }],
        quick: ['marks:Check', 'marks:Cross'],
      },
    },
  };
}
