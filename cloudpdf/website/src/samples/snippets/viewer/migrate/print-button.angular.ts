// 2.x had no Angular package: a component ran the snippet and kept its registry.
//
// import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
// import EmbedPDF, { type CommandsPlugin, type PluginRegistry } from '@embedpdf/snippet';
//
// @Component({
//   selector: 'app-review',
//   template: `
//     <button (click)="print()">Print</button>
//     <div #host style="height: 80vh"></div>
//   `,
// })
// export class Review implements AfterViewInit {
//   @ViewChild('host') host!: ElementRef<HTMLDivElement>;
//   private registry?: PluginRegistry;
//
//   async ngAfterViewInit() {
//     const container = EmbedPDF.init({
//       type: 'container',
//       target: this.host.nativeElement,
//       src: { grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' },
//     });
//     this.registry = await container?.registry;
//   }
//
//   print() {
//     this.registry?.getPlugin<CommandsPlugin>('commands')?.provides().execute('document:print');
//   }
// }

import { Component, signal } from '@angular/core';
import { EpdfPdfViewer, type Viewer } from '@cloudpdf/viewer-angular';

@Component({
  selector: 'app-review',
  imports: [EpdfPdfViewer],
  template: `
    <button [disabled]="!viewer()" (click)="viewer()?.commands?.execute('document:print')">
      Print
    </button>
    <epdf-pdf-viewer [src]="{ grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' }" style="height: 80vh" (ready)="viewer.set($event)" />
  `,
})
export class Review {
  protected readonly viewer = signal<Viewer | null>(null);
}
