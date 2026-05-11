import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  signal,
} from '@angular/core';
import {
  createPluginCapabilitySignal,
  type I18nCapability,
  type I18nPlugin,
  PDFViewer,
  type PluginRegistry,
} from '@embedpdf/angular-pdf-viewer';

import {
  DEMO_DOCUMENT_URL,
  createThemeConfig,
  createThemePreferenceSignal,
} from '../../example-support';

const LOCALES = [
  { code: 'en', name: 'English' },
  { code: 'nl', name: 'Dutch' },
  { code: 'de', name: 'German' },
  { code: 'fr', name: 'French' },
  { code: 'es', name: 'Spanish' },
  { code: 'zh-CN', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'sv', name: 'Swedish' },
] as const;

export const selector = 'i18n-example';

@Component({
  selector,
  imports: [PDFViewer],
  template: `
    <div class="flex flex-col gap-4">
      <div
        class="flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
      >
        <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Language:</label>
        <select
          class="cursor-pointer rounded-md border-0 bg-white py-1.5 pl-3 pr-8 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600"
          [value]="currentLocale()"
          (change)="onLocaleChange($event)"
        >
          @for (locale of locales; track locale.code) {
            <option [value]="locale.code">{{ locale.name }}</option>
          }
        </select>
        <span class="text-xs text-gray-500 dark:text-gray-400">
          Changing language updates all tooltips, menus, and labels instantly.
        </span>
      </div>

      <div
        class="h-[600px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600"
      >
        <embedpdf-viewer
          class="block h-full w-full"
          [config]="viewerConfig()"
          (ready)="onReady($event)"
        />
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class I18nExample {
  readonly themePreference = createThemePreferenceSignal();
  readonly theme = createThemeConfig(this.themePreference);
  readonly locales = LOCALES;
  readonly currentLocale = signal<string>('en');
  readonly registry = signal<PluginRegistry | null>(null);
  readonly i18n = createPluginCapabilitySignal<I18nPlugin>(this.registry, 'i18n');
  readonly viewerConfig = computed(() => ({
    src: DEMO_DOCUMENT_URL,
    theme: this.theme(),
    i18n: {
      defaultLocale: 'en',
    },
  }));

  constructor() {
    effect((onCleanup) => {
      const capability = this.i18n();
      if (!capability) {
        this.currentLocale.set('en');
        return;
      }

      const cleanup = capability.onLocaleChange((event) => {
        this.currentLocale.set(event.currentLocale);
      });
      onCleanup(cleanup);
    });
  }

  onReady(registry: PluginRegistry) {
    this.registry.set(registry);
  }

  onLocaleChange(event: Event) {
    const newLocale = (event.target as HTMLSelectElement).value;
    this.currentLocale.set(newLocale);
    this.i18n()?.setLocale(newLocale);
  }
}
