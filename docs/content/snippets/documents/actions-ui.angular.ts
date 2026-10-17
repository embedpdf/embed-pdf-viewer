import { Component, inject } from '@angular/core';
import { provideEmbedPdf } from '@embedpdf/angular/runtime';
import { withActions, withActionsUi } from '@embedpdf/angular/actions';
import { engine } from './pdf';
import { Toasts } from './toasts';

@Component({
  selector: 'app-contract-viewer',
  providers: [
    provideEmbedPdf(
      { engine },
      /* … */
      withActions(),
      // Runs in an injection context, so your handlers can use your services
      withActionsUi(() => {
        const toasts = inject(Toasts);
        return {
          openUri: (uri) => {
            if (confirm(`Open ${uri}?`)) window.open(uri, '_blank', 'noopener');
          },
          alert: (message) => toasts.show(message),
        };
      }),
    ),
  ],
  template: `<!-- your viewer -->`,
})
export class ContractViewer {}
