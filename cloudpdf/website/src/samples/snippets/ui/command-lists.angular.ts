import { Component } from '@angular/core';
import { withCommands } from '@embedpdf/angular/commands';
import { historyCommands } from '@embedpdf/angular/history';
import { documentCommands, provideEmbedPdf } from '@embedpdf/angular/runtime';
import { stageCommands } from '@embedpdf/angular/stage';
import { engine } from './pdf';

@Component({
  selector: 'app-document-viewer',
  providers: [
    provideEmbedPdf(
      { engine },
      /* … */
      // Zoom, pages and rotation, undo and redo, download and print: no tools, no copy.
      withCommands({ commands: [...stageCommands, ...historyCommands, ...documentCommands] }),
    ),
  ],
  template: `<!-- your toolbar and pages -->`,
})
export class DocumentViewer {}
