import { Component, input } from '@angular/core';
import { EpdfPdfViewer, type Layout } from '@cloudpdf/viewer-angular';

@Component({
  selector: 'app-report',
  imports: [EpdfPdfViewer],
  template: `
    <!-- Each branch mounts its own viewer with its own config. -->
    @if (toolbarBelow()) {
      <epdf-pdf-viewer [src]="{ shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' }" [layout]="toolbarAtBottom" style="height: 100vh" />
    } @else {
      <epdf-pdf-viewer [src]="{ shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' }" style="height: 100vh" />
    }
  `,
})
export class Report {
  readonly toolbarBelow = input(false);
  readonly toolbarAtBottom = (layout: Layout) => layout.place('main', 'bottom');
}
