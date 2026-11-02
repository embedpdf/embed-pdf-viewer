import { Component, signal, ViewEncapsulation } from '@angular/core';
import { EpdfPdfViewer, type Viewer } from '@embedpdf/viewer-angular';

const forms = '/pdfs/forms.pdf';

@Component({
  selector: 'demo-root',
  imports: [EpdfPdfViewer],
  template: `
    <div class="app">
      <epdf-pdf-viewer class="viewer" [src]="forms" (ready)="onReady($event)" />
      <footer class="values">
        <span class="label">exportValues()</span>
        <code class="code">{{ values() }}</code>
      </footer>
    </div>
  `,
  styleUrl: './values.css',
  encapsulation: ViewEncapsulation.None,
})
export class App {
  readonly forms = forms;
  readonly values = signal('{}');

  // Once the form is open: show its values as they change, and fill in what the app knows.
  onReady(viewer: Viewer) {
    viewer.documents.onOpened(async () => {
      const form = viewer.get('form');
      form.onValueChanged(() => this.values.set(JSON.stringify(form.exportValues())));
      await form.importValues({ name: 'Ada Lovelace', email: 'ada@example.com' });
    });
  }
}
