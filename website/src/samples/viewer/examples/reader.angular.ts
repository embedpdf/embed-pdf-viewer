import { Component, computed, signal } from '@angular/core';
import {
  EpdfButton,
  EpdfPdfViewer,
  EpdfToolbarItem,
  type ThemeConfig,
  type ViewerConfig,
} from '@embedpdf/viewer-angular';

const article = 'https://www.embedpdf.com/pdfs/article.pdf';

// Paper by day and a warm dark at night, with a book's serif for the viewer's own words in both.
const book: ThemeConfig = {
  tokens: {
    radius: '10px',
    font: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif",
  },
  light: {
    accent: '#a0522d',
    background: '#efe7d6',
    surface: '#f8f2e4',
    'surface-raised': '#fbf7ee',
    text: '#3b2f23',
    'text-muted': '#857461',
    border: '#e0d3bb',
    hover: '#efe5d1',
    canvas: '#ebe2ce',
    // A warm brown shadow, so the pages lie on the paper like an open book.
    'page-shadow': '0 2px 4px rgb(92 64 32 / 0.12), 0 12px 32px rgb(92 64 32 / 0.22)',
  },
  dark: {
    accent: '#d9a46c',
    background: '#15120e',
    surface: '#1e1a15',
    'surface-raised': '#27211b',
    text: '#ece2d0',
    'text-muted': '#a39582',
    border: '#3b332a',
    hover: '#302820',
    canvas: '#110e0b',
    // The pages stay white at night, with a black shadow where the paper's is brown.
    'page-shadow': '0 2px 4px rgb(0 0 0 / 0.3), 0 12px 32px rgb(0 0 0 / 0.4)',
  },
};

@Component({
  selector: 'demo-root',
  imports: [EpdfPdfViewer, EpdfToolbarItem, EpdfButton],
  template: `
    <epdf-pdf-viewer [src]="article" [config]="config" [theme]="theme()" style="height: 100%">
      <ng-template epdfToolbarItem="night">
        <epdf-button
          icon="moon"
          label="Night"
          [active]="nightMode()"
          (click)="nightMode.set(!nightMode())"
        ></epdf-button>
      </ng-template>
    </epdf-pdf-viewer>
  `,
})
export class App {
  readonly article = article;
  readonly nightMode = signal(false);
  readonly theme = computed(
    (): ThemeConfig => ({ ...book, preference: this.nightMode() ? 'dark' : 'light' }),
  );
  readonly config: ViewerConfig = {
    // Nothing changes the document; searching and copying still work.
    readOnly: true,
    icons: {
      contents: ['M3 6h.01', 'M3 12h.01', 'M3 18h.01', 'M8 6h13', 'M8 12h13', 'M8 18h13'],
      pages: [
        'M5 4h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z',
        'M15 4h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z',
        'M5 14h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z',
        'M15 14h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z',
      ],
      moon: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
    },
    // The whole layout: one pill floating over the pages, and Copy over selected text.
    layout: {
      bars: {
        reader: {
          // Stays on screen: a bar with the page number would otherwise fade while nothing moves.
          place: { float: 'bottom', hideWhenIdle: false },
          center: [
            ['panel:outline', 'panel:thumbnails'],
            { items: ['page:previous', { custom: 'page-number' }, 'page:next'], importance: 5 },
            {
              items: [{ custom: 'zoom', command: 'menu:zoom', variants: ['inline', 'button'] }],
              importance: 2,
            },
            { items: ['panel:search', { custom: 'night' }], importance: 4 },
          ],
        },
        selection: { place: { at: 'selection' }, center: [['selection:copy']] },
      },
      menus: {
        zoom: [
          ['zoom:fit-page', 'zoom:fit-width'],
          ['zoom:100', 'zoom:150', 'zoom:200'],
        ],
      },
      panels: {
        outline: {
          side: 'start',
          title: 'Contents',
          icon: 'contents',
          present: { medium: 'overlay', expanded: 'overlay' },
        },
        // A sheet at every size: on a wider viewer, as wide as a column of text, in the middle.
        thumbnails: { side: 'start', title: 'Pages', icon: 'pages', present: 'sheet', width: 560 },
        search: { side: 'end', title: 'Find', icon: 'search', present: { expanded: 'overlay' } },
      },
      tabs: 'never',
    },
    plugins: {
      // A book: two facing pages, one spread at a time, all of it in view, with room at the
      // bottom for the pill. One page when the viewer is taller than it is wide.
      stage: {
        flow: 'paged',
        spread: 'odd',
        zoom: { mode: 'fit-page' },
        padding: { top: 24, right: 24, bottom: 72, left: 24 },
        gap: 0,
        responsive: [
          {
            when: { orientation: 'portrait' },
            settings: { spread: 'none', padding: { top: 16, right: 16, bottom: 72, left: 16 } },
          },
        ],
      },
    },
  };
}
