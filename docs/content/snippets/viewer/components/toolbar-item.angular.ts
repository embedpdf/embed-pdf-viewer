import { Component, inject } from '@angular/core';
import { EpdfPdfViewer, EpdfToolbarItem } from '@embedpdf/viewer-angular';
import { Versions } from './versions'; // your app

@Component({
  selector: 'app-contract',
  imports: [EpdfPdfViewer, EpdfToolbarItem],
  template: `
    <epdf-pdf-viewer [src]="versions.currentUrl()" [layout]="layout" style="height: 100vh">
      <ng-template epdfToolbarItem="versions">
        <select class="versions" [value]="versions.current()" (change)="versions.select($any($event.target).value)">
          @for (version of versions.list(); track version.id) {
            <option [value]="version.id">{{ version.label }}</option>
          }
        </select>
      </ng-template>
    </epdf-pdf-viewer>
  `,
})
export class Contract {
  protected readonly versions = inject(Versions);
  readonly layout = (layout) =>
    layout.add({ custom: 'versions', command: 'acme:versions' }, { to: 'main', section: 'start' });
}
