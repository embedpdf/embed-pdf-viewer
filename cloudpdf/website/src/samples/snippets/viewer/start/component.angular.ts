import { Component } from '@angular/core';
import { EpdfPdfViewer, EpdfToolbarItem, type Layout } from '@cloudpdf/viewer-angular';
import { DocumentStatus } from './document-status';

@Component({
  selector: 'app-root',
  imports: [EpdfPdfViewer, EpdfToolbarItem, DocumentStatus],
  template: `
    <epdf-pdf-viewer [src]="{ grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' }" [layout]="layout" style="height: 100vh">
      <ng-template epdfToolbarItem="status">
        <app-document-status />
      </ng-template>
    </epdf-pdf-viewer>
  `,
})
export class App {
  readonly layout = (layout: Layout) => layout.add({ custom: 'status' }, { to: 'main', section: 'end' });
}
