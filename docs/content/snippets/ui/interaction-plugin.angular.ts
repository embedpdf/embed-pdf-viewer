import { Component } from '@angular/core';
import { withInteraction } from '@embedpdf/angular/interaction';
import { withRender } from '@embedpdf/angular/render';
import { provideEmbedPdf } from '@embedpdf/angular/runtime';
import { withStage } from '@embedpdf/angular/stage';
import { engine } from './pdf';

@Component({
  selector: 'app-document-viewer',
  providers: [provideEmbedPdf({ engine }, withStage(), withRender(), withInteraction())],
  template: `<!-- your toolbar and pages -->`,
})
export class DocumentViewer {}
