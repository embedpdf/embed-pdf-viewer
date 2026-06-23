import { ChangeDetectionStrategy, Component, computed, effect, signal } from '@angular/core';
import {
  createDocumentScopeSignal,
  createPluginCapabilitySignal,
  PDFViewer,
  type PluginRegistry,
  SpreadMode,
  type SpreadPlugin,
} from '@embedpdf/angular-pdf-viewer';

import {
  DEMO_DOCUMENT_URL,
  createThemeConfig,
  createThemePreferenceSignal,
} from '../../example-support';

export const selector = 'spread-example';

@Component({
  selector,
  imports: [PDFViewer],
  template: `
    <div class="flex flex-col gap-4">
      <div
        class="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800"
      >
        <span class="px-2 text-sm font-medium text-gray-600 dark:text-gray-300">
          Layout Mode:
        </span>
        <div class="flex gap-1">
          @for (option of options; track option.mode) {
            <button
              type="button"
              [attr.aria-pressed]="currentMode() === option.mode"
              class="flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors"
              [disabled]="!docSpread()"
              [class.bg-white]="currentMode() === option.mode"
              [class.text-blue-600]="currentMode() === option.mode"
              [class.shadow-sm]="currentMode() === option.mode"
              [class.dark:bg-gray-700]="currentMode() === option.mode"
              [class.dark:text-blue-400]="currentMode() === option.mode"
              [class.text-gray-600]="currentMode() !== option.mode"
              [class.hover:bg-gray-200]="currentMode() !== option.mode"
              [class.dark:text-gray-400]="currentMode() !== option.mode"
              [class.dark:hover:bg-gray-700]="currentMode() !== option.mode"
              (click)="setMode(option.mode)"
            >
              {{ option.label }}
            </button>
          }
        </div>
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
export default class SpreadExample {
  readonly themePreference = createThemePreferenceSignal();
  readonly theme = createThemeConfig(this.themePreference);
  readonly registry = signal<PluginRegistry | null>(null);
  readonly spread = createPluginCapabilitySignal<SpreadPlugin>(this.registry, 'spread');
  readonly docSpread = createDocumentScopeSignal(this.spread, 'spread-doc');
  readonly currentMode = signal<SpreadMode>(SpreadMode.None);
  readonly options = [
    { mode: SpreadMode.None, label: 'Single Page' },
    { mode: SpreadMode.Odd, label: 'Two-Page (Odd)' },
    { mode: SpreadMode.Even, label: 'Two-Page (Even)' },
  ] as const;
  readonly viewerConfig = computed(() => ({
    theme: this.theme(),
    spread: {
      defaultSpreadMode: SpreadMode.None,
    },
    documentManager: {
      initialDocuments: [
        {
          url: DEMO_DOCUMENT_URL,
          documentId: 'spread-doc',
        },
      ],
    },
  }));

  constructor() {
    effect((onCleanup) => {
      const spreadScope = this.docSpread();
      if (!spreadScope) {
        this.currentMode.set(SpreadMode.None);
        return;
      }

      this.currentMode.set(spreadScope.getSpreadMode());

      const cleanup = spreadScope.onSpreadChange((mode) => {
        this.currentMode.set(mode);
      });
      onCleanup(cleanup);
    });
  }

  onReady(registry: PluginRegistry) {
    this.registry.set(registry);
  }

  setMode(mode: SpreadMode) {
    this.docSpread()?.setSpreadMode(mode);
  }
}
