import { Component, input } from '@angular/core';
import { EpdfPdfViewer, type Layout } from '@embedpdf/viewer-angular';

@Component({
  selector: 'app-report',
  imports: [EpdfPdfViewer],
  template: `
    <!-- Each branch mounts its own viewer with its own config. -->
    @if (toolbarBelow()) {
      <epdf-pdf-viewer src="/report.pdf" [layout]="toolbarAtBottom" style="height: 100vh" />
    } @else {
      <epdf-pdf-viewer src="/report.pdf" style="height: 100vh" />
    }
  `,
})
export class Report {
  readonly toolbarBelow = input(false);
  readonly toolbarAtBottom = (layout: Layout) => layout.place('main', 'bottom');
}
