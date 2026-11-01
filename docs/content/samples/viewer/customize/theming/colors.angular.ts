import { Component, computed, signal, ViewEncapsulation } from '@angular/core';
import { EpdfPdfViewer, type ThemeConfig } from '@embedpdf/viewer-angular';

// [!doc-source welcome]
const welcome = '/pdfs/welcome.pdf';
// [!/doc-source]

// Your colors for both modes, and what's different in dark.
const brand: ThemeConfig = {
  accent: '#0f6e56',
  tokens: { surface: '#fbfaf7', canvas: '#ece8df', radius: '2px' },
  dark: {
    accent: '#4fbf98',
    surface: '#16201c',
    'surface-raised': '#1d2a25',
    canvas: '#0c1210',
    hover: '#24332d',
  },
};

@Component({
  selector: 'demo-root',
  imports: [EpdfPdfViewer],
  styleUrl: './colors.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="app" [class.dark]="dark()">
      <header class="bar">
        <label>
          <input #toggle type="checkbox" [checked]="dark()" (change)="dark.set(toggle.checked)" />
          Dark
        </label>
      </header>
      <epdf-pdf-viewer class="viewer" [src]="welcome" [theme]="theme()" />
    </div>
  `,
})
export class App {
  readonly welcome = welcome;
  readonly dark = signal(false);
  readonly theme = computed(
    (): ThemeConfig => ({ ...brand, preference: this.dark() ? 'dark' : 'light' }),
  );
}
