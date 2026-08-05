import { Component } from '@angular/core';
import { PDFViewer } from '@embedpdf/angular-pdf-viewer';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [PDFViewer],
  template: `
    <pdf-viewer
      [config]="{ src: 'https://snippet.embedpdf.com/ebook.pdf' }"
      style="height: 500px"
      (ready)="onReady($event)"
    />
  `,
})
export class AppComponent {
  onReady(registry: unknown) {
    console.log('PDF viewer ready!', registry);
  }
}
