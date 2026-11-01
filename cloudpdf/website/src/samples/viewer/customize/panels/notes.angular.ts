import { Component, ViewEncapsulation } from '@angular/core';
import { EpdfPanel, EpdfPdfViewer, type ViewerConfig } from '@cloudpdf/viewer-angular';

const welcome = { grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };

@Component({
  selector: 'demo-root',
  imports: [EpdfPdfViewer, EpdfPanel],
  styleUrl: './notes.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <epdf-pdf-viewer [src]="welcome" [config]="config" style="height: 100%">
      <ng-template epdfPanel="notes">
        <textarea class="notes" placeholder="Your notes"></textarea>
      </ng-template>
    </epdf-pdf-viewer>
  `,
})
export class App {
  readonly welcome = welcome;
  readonly config: ViewerConfig = {
    layout: (layout) =>
      layout
        .addPanel('notes', {
          side: 'end',
          title: 'Notes',
          icon: 'book',
          present: { medium: 'dock' },
          width: { initial: 320, min: 240, max: 480 },
        })
        .add('panel:notes', { to: 'main', section: 'end' }),
  };
}
