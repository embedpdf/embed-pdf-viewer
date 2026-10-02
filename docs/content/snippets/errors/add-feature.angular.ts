import { Component, inject } from '@angular/core';
import { provideEmbedPdf } from '@embedpdf/angular/runtime';
import { EpdfRender, withRender } from '@embedpdf/angular/render';
import { withStage } from '@embedpdf/angular/stage';
import { engine } from './pdf';

@Component({
  selector: 'app-document-viewer',
  // withRender() is what gives the viewer EpdfRender
  providers: [provideEmbedPdf({ engine }, withStage(), withRender())],
  template: `<!-- your toolbar and pages -->`,
})
export class DocumentViewer {
  private readonly render = inject(EpdfRender);
}
