import { Component } from '@angular/core';
import { EpdfPdfViewer, type ViewerConfig } from '@cloudpdf/viewer-angular';

const registration = { grant: 'shr_sjOrUrwF2Sf0X5ADfySRG58L' };

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
        libraries: [{ id: 'marks', url: 'https://www.cloudpdf.com/pdfs/marks.pdf' }],
        quick: ['marks:Check', 'marks:Cross'],
      },
    },
  };
}
