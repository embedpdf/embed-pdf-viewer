import { Component } from '@angular/core';
import { vibrationFeedback, withFeedback, withInteraction } from '@embedpdf/angular/interaction';
import { provideEmbedPdf } from '@embedpdf/angular/runtime';
import { engine } from './pdf';

@Component({
  selector: 'app-document-viewer',
  providers: [
    provideEmbedPdf(
      { engine },
      /* … */
      withInteraction(),
      withFeedback({ provider: vibrationFeedback }),
    ),
  ],
  template: `<!-- your toolbar and pages -->`,
})
export class DocumentViewer {}
