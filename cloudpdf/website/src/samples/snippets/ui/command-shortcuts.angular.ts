import { Component } from '@angular/core';
import { standardCommands, withCommandShortcuts, withCommands } from '@embedpdf/angular/commands';
import { provideEmbedPdf } from '@embedpdf/angular/runtime';
import { engine } from './pdf';

@Component({
  selector: 'app-document-viewer',
  providers: [
    provideEmbedPdf(
      { engine },
      /* … */
      withCommands({ commands: standardCommands }),
      withCommandShortcuts(),
    ),
  ],
  template: `<!-- your toolbar and pages -->`,
})
export class DocumentViewer {}
