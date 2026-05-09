import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import {
  PDFViewer,
  type PDFViewerConfig,
  type PluginRegistry,
} from '@embedpdf/angular-pdf-viewer';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [PDFViewer],
  template: `
    <main class="page">
      <header class="header">
        <h1>EmbedPDF Angular Viewer Demo</h1>
        <p class="status" data-testid="viewer-status">
          {{ ready() ? 'ready' : 'loading' }}
        </p>
      </header>

      <embedpdf-pdf-viewer
        class="viewer"
        [config]="viewerConfig"
        (ready)="onReady($event)"
      />
    </main>
  `,
  styles: `
    .page {
      box-sizing: border-box;
      height: 100dvh;
      display: grid;
      grid-template-rows: auto 1fr;
      gap: 12px;
      padding: 12px;
      background: #0f172a;
      color: #e2e8f0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto,
        Helvetica, Arial, sans-serif;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
    }

    h1 {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 600;
    }

    .status {
      margin: 0;
      font-size: 0.85rem;
      opacity: 0.85;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .viewer {
      min-height: 0;
      border-radius: 10px;
      overflow: hidden;
      background: #0b1220;
      border: 1px solid rgba(148, 163, 184, 0.25);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  readonly ready = signal(false);

  readonly viewerConfig = {
    src: 'https://snippet.embedpdf.com/ebook.pdf',
    theme: { preference: 'system' },
  } satisfies PDFViewerConfig;

  onReady(_registry: PluginRegistry) {
    this.ready.set(true);
  }
}
