import { Component, inject, signal } from '@angular/core';
import { EpdfPdfViewer, EpdfPdfViewerRef, EpdfToolbarItem, type Viewer } from '@embedpdf/viewer-angular';

// Inside the viewer: any component in one of its templates.
@Component({
  selector: 'app-first-page',
  template: `<button (click)="viewer()?.get('stage').goToPage(0)">First page</button>`,
})
export class FirstPage {
  protected readonly viewer = inject(EpdfPdfViewerRef).viewer;
}

// Outside the viewer: keep it from (ready).
@Component({
  selector: 'app-review',
  imports: [EpdfPdfViewer, EpdfToolbarItem, FirstPage],
  template: `
    <button [disabled]="!viewer()" (click)="viewer()?.commands.execute('document:print')">Print</button>
    <epdf-pdf-viewer src="/report.pdf" style="height: 80vh" (ready)="viewer.set($event)">
      <ng-template epdfToolbarItem="first-page"><app-first-page /></ng-template>
    </epdf-pdf-viewer>
  `,
})
export class Review {
  protected readonly viewer = signal<Viewer | null>(null);
}
