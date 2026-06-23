import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { type PDFViewerConfig, PDFViewer } from '@embedpdf/angular-pdf-viewer';

import { DEMO_DOCUMENT_URL, createThemePreferenceSignal } from '../../example-support';

const BRAND_COLORS = [
  {
    name: 'Purple',
    primary: '#9333ea',
    hover: '#7e22ce',
    active: '#6b21a8',
    light: '#f3e8ff',
    darkLight: '#3b0764',
  },
  {
    name: 'Blue',
    primary: '#2563eb',
    hover: '#1d4ed8',
    active: '#1e40af',
    light: '#dbeafe',
    darkLight: '#1e3a8a',
  },
  {
    name: 'Green',
    primary: '#16a34a',
    hover: '#15803d',
    active: '#166534',
    light: '#dcfce7',
    darkLight: '#14532d',
  },
  {
    name: 'Orange',
    primary: '#ea580c',
    hover: '#c2410c',
    active: '#9a3412',
    light: '#ffedd5',
    darkLight: '#7c2d12',
  },
  {
    name: 'Pink',
    primary: '#db2777',
    hover: '#be185d',
    active: '#9d174d',
    light: '#fce7f3',
    darkLight: '#831843',
  },
] as const;

export const selector = 'theme-example';

@Component({
  selector,
  imports: [PDFViewer],
  template: `
    <div class="flex flex-col gap-4">
      <div
        class="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
      >
        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
          Choose brand color:
        </span>
        <div class="flex gap-2">
          @for (color of brandColors; track color.name) {
            <button
              type="button"
              [attr.aria-label]="'Use ' + color.name + ' theme accent'"
              [attr.aria-pressed]="selectedColor().name === color.name"
              [title]="color.name"
              class="h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 focus-visible:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400"
              [class.border-gray-900]="selectedColor().name === color.name"
              [class.dark:border-white]="selectedColor().name === color.name"
              [class.ring-2]="selectedColor().name === color.name"
              [class.ring-offset-2]="selectedColor().name === color.name"
              [class.ring-offset-gray-50]="selectedColor().name === color.name"
              [class.dark:ring-offset-gray-800]="selectedColor().name === color.name"
              [class.border-transparent]="selectedColor().name !== color.name"
              [style.backgroundColor]="color.primary"
              (click)="selectedColor.set(color)"
            ></button>
          }
        </div>
        <span class="text-sm text-gray-500 dark:text-gray-400">
          Selected: <strong>{{ selectedColor().name }}</strong>
        </span>
      </div>

      <div
        class="h-[600px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600"
      >
        <embedpdf-viewer class="block h-full w-full" [config]="viewerConfig()" />
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ThemeExample {
  readonly brandColors = BRAND_COLORS;
  readonly selectedColor = signal<(typeof BRAND_COLORS)[number]>(BRAND_COLORS[0]);
  readonly themePreference = createThemePreferenceSignal();
  readonly viewerConfig = computed<PDFViewerConfig>(() => ({
    src: DEMO_DOCUMENT_URL,
    theme: {
      preference: this.themePreference(),
      light: {
        accent: {
          primary: this.selectedColor().primary,
          primaryHover: this.selectedColor().hover,
          primaryActive: this.selectedColor().active,
          primaryLight: this.selectedColor().light,
          primaryForeground: '#ffffff',
        },
      },
      dark: {
        accent: {
          primary: this.selectedColor().primary,
          primaryHover: this.selectedColor().hover,
          primaryActive: this.selectedColor().active,
          primaryLight: this.selectedColor().darkLight,
          primaryForeground: '#ffffff',
        },
      },
    },
  }));
}
