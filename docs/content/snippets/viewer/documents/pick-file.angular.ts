import { Component, signal } from '@angular/core';
import { EpdfPdfViewer } from '@embedpdf/viewer-angular';

@Component({
  selector: 'app-upload',
  imports: [EpdfPdfViewer],
  template: `
    <input type="file" accept="application/pdf" (change)="pick($event)" />
    <epdf-pdf-viewer [src]="file()" style="height: 80vh" />
  `,
})
export class Upload {
  readonly file = signal<File | null>(null);

  pick(event: Event) {
    this.file.set((event.target as HTMLInputElement).files?.[0] ?? null);
  }
}
