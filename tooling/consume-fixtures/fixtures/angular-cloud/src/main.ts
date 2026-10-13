// Consumer archetype: an Angular app on CloudPDF, the viewer's cloud door alone. `ng build` checks
// the template against the packed declarations (strict templates), then bundles it with the
// application builder.
import { Component, provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { EpdfPdfViewer, type ViewerConfig } from '@cloudpdf/viewer-angular';

// Proves the packed inputs are the cloud's, not `any`: a URL is not a CloudPDF document.
// @ts-expect-error a URL is a document of @embedpdf/viewer-angular
export const urlDocument: ViewerConfig['src'] = '/report.pdf';

@Component({
  selector: 'app-root',
  imports: [EpdfPdfViewer],
  template: `<epdf-pdf-viewer [src]="{ token: token }" style="height: 100vh" />`,
})
class App {
  readonly token = 'fixture-token';
}

bootstrapApplication(App, { providers: [provideZonelessChangeDetection()] }).catch(console.error);
