import { Component, input } from '@angular/core';
import { EpdfPdfViewer, type Layout } from '@embedpdf/viewer-angular';

@Component({
  selector: 'app-report',
  imports: [EpdfPdfViewer],
  template: `
    <!-- Each branch mounts its own viewer with its own config. -->
    @if (simple()) {
      <epdf-pdf-viewer src="/report.pdf" [layout]="simpleLayout" style="height: 100vh" />
    } @else {
      <epdf-pdf-viewer src="/report.pdf" style="height: 100vh" />
    }
  `,
})
export class Report {
  readonly simple = input(false);
  readonly simpleLayout = (layout: Layout) =>
    layout.remove(['tool:pan', 'menu:view'], { from: 'main' });
}
