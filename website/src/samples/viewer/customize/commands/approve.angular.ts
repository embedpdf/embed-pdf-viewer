import { Component, signal, ViewEncapsulation } from '@angular/core';
import { EpdfPdfViewer, type ViewerConfig } from '@embedpdf/viewer-angular';

const welcome = '/pdfs/welcome.pdf';

@Component({
  selector: 'demo-root',
  imports: [EpdfPdfViewer],
  styleUrl: './approve.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="app" style="height: 100%">
      <p class="status">
        Status: <strong>{{ status() }}</strong>
      </p>
      <epdf-pdf-viewer [src]="welcome" [config]="config" class="viewer" />
    </div>
  `,
})
export class App {
  readonly welcome = welcome;
  readonly status = signal('Waiting for approval');
  readonly config: ViewerConfig = {
    commands: [
      {
        id: 'acme:approve',
        label: 'Approve',
        icon: 'check',
        shortcut: 'Mod+Enter',
        run: () => this.status.set(`Approved at ${new Date().toLocaleTimeString()}`),
      },
    ],
    layout: (layout) => layout.add('acme:approve', { to: 'main', section: 'end' }),
  };
}
