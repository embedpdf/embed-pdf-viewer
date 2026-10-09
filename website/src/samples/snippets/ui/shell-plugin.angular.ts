import { Component } from '@angular/core';
import { provideEmbedPdf } from '@embedpdf/angular/runtime';
import { withShell } from '@embedpdf/angular/shell';
import { engine } from './pdf';

@Component({
  selector: 'app-document-viewer',
  providers: [provideEmbedPdf({ engine }, /* … */ withShell())],
  template: `<!-- your toolbar, panels and pages -->`,
})
export class DocumentViewer {}
