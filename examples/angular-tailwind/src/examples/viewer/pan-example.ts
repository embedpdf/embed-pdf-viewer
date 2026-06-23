import { ChangeDetectionStrategy, Component, computed, effect, signal } from '@angular/core';
import {
  createDocumentScopeSignal,
  createPluginCapabilitySignal,
  type PanPlugin,
  PDFViewer,
  type PluginRegistry,
} from '@embedpdf/angular-pdf-viewer';

import {
  DEMO_DOCUMENT_URL,
  createThemeConfig,
  createThemePreferenceSignal,
} from '../../example-support';

export const selector = 'pan-example';

@Component({
  selector,
  imports: [PDFViewer],
  template: `
    <div class="flex flex-col gap-4">
      <div
        class="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800"
      >
        <span class="px-2 text-sm font-medium text-gray-600 dark:text-gray-300">
          Interaction Mode:
        </span>
        <button
          type="button"
          class="flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors"
          [class.bg-white]="!isPanMode()"
          [class.text-blue-600]="!isPanMode()"
          [class.shadow-sm]="!isPanMode()"
          [class.dark:bg-gray-700]="!isPanMode()"
          [class.dark:text-blue-400]="!isPanMode()"
          [class.text-gray-600]="isPanMode()"
          [class.hover:bg-gray-200]="isPanMode()"
          [class.dark:text-gray-400]="isPanMode()"
          [class.dark:hover:bg-gray-700]="isPanMode()"
          (click)="togglePanMode()"
        >
          Select Text
        </button>
        <button
          type="button"
          class="flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors"
          [class.bg-white]="isPanMode()"
          [class.text-blue-600]="isPanMode()"
          [class.shadow-sm]="isPanMode()"
          [class.dark:bg-gray-700]="isPanMode()"
          [class.dark:text-blue-400]="isPanMode()"
          [class.text-gray-600]="!isPanMode()"
          [class.hover:bg-gray-200]="!isPanMode()"
          [class.dark:text-gray-400]="!isPanMode()"
          [class.dark:hover:bg-gray-700]="!isPanMode()"
          (click)="togglePanMode()"
        >
          Pan (Hand Tool)
        </button>
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
export default class PanExample {
  readonly themePreference = createThemePreferenceSignal();
  readonly theme = createThemeConfig(this.themePreference);
  readonly registry = signal<PluginRegistry | null>(null);
  readonly pan = createPluginCapabilitySignal<PanPlugin>(this.registry, 'pan');
  readonly docPan = createDocumentScopeSignal(this.pan, 'pan-doc');
  readonly isPanMode = signal(false);
  readonly viewerConfig = computed(() => ({
    theme: this.theme(),
    pan: {
      defaultMode: 'mobile' as const,
    },
    documentManager: {
      initialDocuments: [
        {
          url: DEMO_DOCUMENT_URL,
          documentId: 'pan-doc',
        },
      ],
    },
  }));

  constructor() {
    effect((onCleanup) => {
      const panScope = this.docPan();
      if (!panScope) {
        this.isPanMode.set(false);
        return;
      }

      this.isPanMode.set(panScope.isPanMode());

      const cleanup = panScope.onPanModeChange((isActive) => {
        this.isPanMode.set(isActive);
      });
      onCleanup(cleanup);
    });
  }

  onReady(registry: PluginRegistry) {
    this.registry.set(registry);
  }

  togglePanMode() {
    this.docPan()?.togglePan();
  }
}
