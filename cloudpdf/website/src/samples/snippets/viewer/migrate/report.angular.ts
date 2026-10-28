// 2.x had no Angular package: a component ran the snippet itself.
//
// import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
// import EmbedPDF from '@embedpdf/snippet';
//
// @Component({
//   selector: 'app-report',
//   template: `<div #host style="height: 100vh"></div>`,
// })
// export class Report implements AfterViewInit {
//   @ViewChild('host') host!: ElementRef<HTMLDivElement>;
//
//   ngAfterViewInit() {
//     const container = EmbedPDF.init({
//       type: 'container',
//       target: this.host.nativeElement,
//       src: { shareToken: 'shr_gvpJcG1ULUMon19C0D1wODSY' },
//       theme: { preference: 'dark' },
//       disabledCategories: ['redaction', 'document-print'],
//     });
//     container?.registry.then((registry) => console.log('ready', registry));
//   }
// }

import { Component } from '@angular/core';
import { EpdfPdfViewer, type Viewer } from '@cloudpdf/viewer-angular';

@Component({
  selector: 'app-report',
  imports: [EpdfPdfViewer],
  template: `
    <epdf-pdf-viewer
      [src]="{ shareToken: 'shr_gvpJcG1ULUMon19C0D1wODSY' }"
      theme="dark"
      [disable]="['redaction', 'documents.print']"
      style="height: 100vh"
      (ready)="onReady($event)"
    />
  `,
})
export class Report {
  onReady(viewer: Viewer) {
    console.log('ready', viewer);
  }
}
