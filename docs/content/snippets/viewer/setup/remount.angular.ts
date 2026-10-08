import { Component, input } from '@angular/core';
import { EpdfPdfViewer } from '@embedpdf/viewer-angular';

@Component({
  selector: 'app-report',
  imports: [EpdfPdfViewer],
  template: `
    <!-- Each branch mounts its own viewer with its own config. -->
    @if (readOnly()) {
      <epdf-pdf-viewer src="/report.pdf" [disable]="['annotations', 'forms']" style="height: 100vh" />
    } @else {
      <epdf-pdf-viewer src="/report.pdf" style="height: 100vh" />
    }
  `,
})
export class Report {
  readonly readOnly = input(false);
}
