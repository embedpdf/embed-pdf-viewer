// Consumer archetype: an Angular app on the viewer's built-in engine, as Quick start writes it.
// `ng build` checks the template against the packed declarations (strict templates), then bundles
// it with the application builder.
import { Component, provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { EpdfPdfViewer, type ViewerConfig } from '@embedpdf/viewer-angular';

// Proves the packed inputs are this door's, not `any`: a CloudPDF document is not one of its documents.
// @ts-expect-error `{ token }` is a document of @cloudpdf/viewer-angular
export const cloudDocument: ViewerConfig['src'] = { token: 'fixture-token' };

@Component({
  selector: 'app-root',
  imports: [EpdfPdfViewer],
  template: `<epdf-pdf-viewer src="/report.pdf" style="height: 100vh" />`,
})
class App {}

bootstrapApplication(App, { providers: [provideZonelessChangeDetection()] }).catch(console.error);
