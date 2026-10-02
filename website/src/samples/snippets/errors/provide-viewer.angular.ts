import { Component, inject } from '@angular/core';
import { EpdfDocuments, provideEmbedPdf } from '@embedpdf/angular/runtime';
import { withRender } from '@embedpdf/angular/render';
import { withStage } from '@embedpdf/angular/stage';
import { DownloadButton } from './download-button';
import { engine } from './pdf';

@Component({
  selector: 'app-document-viewer',
  imports: [DownloadButton],
  // The viewer, for this component and everything in its template
  providers: [provideEmbedPdf({ engine }, withStage(), withRender())],
  template: `<app-download-button />`,
})
export class DocumentViewer {
  // This component can inject it too
  private readonly documents = inject(EpdfDocuments);
}
