import { Component } from '@angular/core';
import { provideEmbedPdf } from '@embedpdf/angular/runtime';
import { withRender } from '@embedpdf/angular/render';
import { withStage } from '@embedpdf/angular/stage';

@Component({
  selector: 'app-document-viewer',
  providers: [
    provideEmbedPdf(
      { engine: () => import('@embedpdf/engine').then((m) => m.localEngine()) },
      withStage(),
      withRender(),
    ),
  ],
  template: `<!-- your toolbar and pages -->`,
})
export class DocumentViewer {}
