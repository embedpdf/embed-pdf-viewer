import { Component } from '@angular/core';
import { standardCommands, withCommands } from '@embedpdf/angular/commands';
import { provideEmbedPdf } from '@embedpdf/angular/runtime';
import { engine } from './pdf';

@Component({
  selector: 'app-document-viewer',
  providers: [
    provideEmbedPdf(
      { engine },
      /* … */
      withCommands({
        commands: [
          ...standardCommands,
          {
            id: 'review:approve',
            label: 'Approve',
            icon: 'check',
            shortcut: 'Mod+Enter',
            enabled: ({ get }) => get(AnnotationToken).canCreate(),
            run: ({ get }) => approveDocument(get(DocumentsToken)),
          },
        ],
      }),
    ),
  ],
  template: `<!-- your toolbar and pages -->`,
})
export class DocumentViewer {}
