import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { type PDFViewerConfig, PDFViewer } from '@embedpdf/angular-pdf-viewer';

import { createThemePreferenceSignal } from '../../example-support';

const PALETTES = [
  {
    id: 'teal',
    label: 'Teal',
    light: '#0f766e',
    hover: '#115e59',
    active: '#134e4a',
    lightSoft: '#ccfbf1',
    darkSoft: '#134e4a',
  },
  {
    id: 'violet',
    label: 'Violet',
    light: '#7c3aed',
    hover: '#6d28d9',
    active: '#5b21b6',
    lightSoft: '#ede9fe',
    darkSoft: '#312e81',
  },
  {
    id: 'rose',
    label: 'Rose',
    light: '#e11d48',
    hover: '#be123c',
    active: '#9f1239',
    lightSoft: '#ffe4e6',
    darkSoft: '#4c0519',
  },
] as const;

@Component({
  selector: 'theme-example',
  imports: [PDFViewer],
  template: `
    <section class="flex flex-col gap-4">
      <div
        class="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/80"
      >
        <div>
          <p class="text-sm font-medium text-slate-900 dark:text-slate-100">Theme tokens</p>
          <p class="text-sm text-slate-600 dark:text-slate-300">
            Swap the viewer accent palette without remounting the Angular component.
          </p>
        </div>
        <div class="ml-auto flex flex-wrap gap-2">
          @for (palette of palettes; track palette.id) {
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition"
              [class.border-slate-900]="selectedPalette().id === palette.id"
              [class.border-transparent]="selectedPalette().id !== palette.id"
              [class.ring-2]="selectedPalette().id === palette.id"
              [class.ring-slate-400]="selectedPalette().id === palette.id"
              [style.backgroundColor]="palette.lightSoft"
              [style.color]="palette.active"
              (click)="selectedPalette.set(palette)"
            >
              <span class="h-2.5 w-2.5 rounded-full" [style.backgroundColor]="palette.light"></span>
              {{ palette.label }}
            </button>
          }
        </div>
      </div>

      <div
        class="h-[620px] overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-950"
      >
        <embedpdf-viewer class="h-full w-full" [config]="viewerConfig()" />
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ThemeExample {
  readonly palettes = PALETTES;
  readonly selectedPalette = signal(PALETTES[0]);
  readonly themePreference = createThemePreferenceSignal();
  readonly viewerConfig = computed<PDFViewerConfig>(() => ({
    src: 'https://snippet.embedpdf.com/ebook.pdf',
    theme: {
      preference: this.themePreference(),
      light: {
        accent: {
          primary: this.selectedPalette().light,
          primaryHover: this.selectedPalette().hover,
          primaryActive: this.selectedPalette().active,
          primaryLight: this.selectedPalette().lightSoft,
          primaryForeground: '#ffffff',
        },
      },
      dark: {
        accent: {
          primary: this.selectedPalette().light,
          primaryHover: this.selectedPalette().hover,
          primaryActive: this.selectedPalette().active,
          primaryLight: this.selectedPalette().darkSoft,
          primaryForeground: '#ffffff',
        },
      },
    },
  }));
}
