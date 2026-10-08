import { Component } from '@angular/core';
import { EpdfPanel, EpdfPdfViewer, type Layout } from '@embedpdf/viewer-angular';
import { Notes } from './notes'; // your app

@Component({
  selector: 'app-review',
  imports: [EpdfPdfViewer, EpdfPanel, Notes],
  template: `
    <epdf-pdf-viewer src="/report.pdf" [layout]="layout" style="height: 100vh">
      <ng-template epdfPanel="notes">
        <app-notes />
      </ng-template>
    </epdf-pdf-viewer>
  `,
})
export class Review {
  readonly layout = (layout: Layout) =>
    layout
      .addPanel('notes', { side: 'end', title: 'Notes', icon: 'book' })
      .add('panel:notes', { to: 'main', section: 'end' });
}
