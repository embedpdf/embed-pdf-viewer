import { Component, signal, ViewEncapsulation } from '@angular/core';
import { EpdfPdfViewer, type Viewer } from '@embedpdf/viewer-angular';

const article = '/pdfs/article.pdf';

@Component({
  selector: 'demo-root',
  imports: [EpdfPdfViewer],
  template: `
    <div class="app">
      <header class="bar">
        <span class="page">{{ page() ? 'Page ' + page() : 'Opening…' }}</span>
        <button
          type="button"
          class="button"
          [disabled]="!viewer()"
          (click)="viewer()?.commands?.execute('document:print')"
        >
          Print
        </button>
      </header>
      <epdf-pdf-viewer class="viewer" [src]="article" (ready)="onReady($event)" />
    </div>
  `,
  styleUrl: './on-ready.css',
  encapsulation: ViewEncapsulation.None,
})
export class App {
  readonly article = article;
  readonly viewer = signal<Viewer | null>(null);
  readonly page = signal<number | null>(null);

  onReady(viewer: Viewer) {
    this.viewer.set(viewer);
    // The pages are the document's: follow the current one once it has opened.
    viewer.documents.onOpened(() => {
      const stage = viewer.get('stage');
      this.page.set(stage.getCurrentPageIndex() + 1);
      viewer.watch(
        () => stage.getCurrentPageIndex(),
        (index) => this.page.set(index + 1),
      );
    });
  }
}
