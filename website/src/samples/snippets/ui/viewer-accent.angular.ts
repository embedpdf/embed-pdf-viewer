import { Component } from '@angular/core';
import { withRender } from '@embedpdf/angular/render';
import { provideEmbedPdf } from '@embedpdf/angular/runtime';
import { withStage } from '@embedpdf/angular/stage';

import { Pages } from './pages';
import { engine } from './pdf';

@Component({
  selector: 'app-document-viewer',
  imports: [Pages],
  providers: [
    provideEmbedPdf({ engine, accent: '#e91e63', page: { shadow: 'none' } }, withStage(), withRender()),
  ],
  template: `<app-pages />`,
})
export class DocumentViewer {}
