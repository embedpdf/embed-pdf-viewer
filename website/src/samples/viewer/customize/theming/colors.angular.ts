import { Component, computed, signal, ViewEncapsulation } from '@angular/core';
import { EpdfPdfViewer, type ThemeConfig } from '@embedpdf/viewer-angular';

const welcome = '/pdfs/welcome.pdf';

// What both modes share, then the colors of each.
const brand: ThemeConfig = {
  accent: '#0f6e56',
  tokens: { radius: '2px' },
  light: { surface: '#fbfaf7', canvas: '#ece8df' },
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
