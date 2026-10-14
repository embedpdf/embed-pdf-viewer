import { Component } from '@angular/core';
import { provideEmbedPdf } from '@embedpdf/angular/runtime';
import { withRender } from '@embedpdf/angular/render';
import { withStage } from '@embedpdf/angular/stage';
import { cloudEngine } from '@cloudpdf/engine';

@Component({
  selector: 'app-document-viewer',
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine({ baseUrl: 'https://pdf.example.com' }) },
      withStage(),
      withRender(),
    ),
  ],
  template: `<!-- your toolbar and pages -->`,
})
export class DocumentViewer {}
