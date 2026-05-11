import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import {
  createDocumentScopeSignal,
  createPluginCapabilitySignal,
  PDFViewer,
  type PluginRegistry,
  type PrintPlugin,
} from '@embedpdf/angular-pdf-viewer';

import {
  DEMO_DOCUMENT_URL,
  createThemeConfig,
  createThemePreferenceSignal,
} from '../../example-support';

export const selector = 'print-example';

@Component({
  selector,
  imports: [PDFViewer],
  template: `
    <div class="flex flex-col gap-4">
      <div
        class="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
      >
        <div class="flex items-center gap-4">
          <button
            type="button"
            class="flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-700"
            [disabled]="isPrinting() || !docPrint()"
            (click)="print()"
          >
            🖨 {{ isPrinting() ? 'Preparing…' : 'Print Document' }}
          </button>

          @if (isPrinting()) {
            <span class="animate-pulse text-sm text-gray-500 dark:text-gray-400">
              Generating print version…
            </span>
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
export default class PrintExample {
  readonly themePreference = createThemePreferenceSignal();
  readonly theme = createThemeConfig(this.themePreference);
  readonly registry = signal<PluginRegistry | null>(null);
  readonly printPlugin = createPluginCapabilitySignal<PrintPlugin>(this.registry, 'print');
  readonly docPrint = createDocumentScopeSignal(this.printPlugin, 'print-doc');
  readonly isPrinting = signal(false);
  readonly viewerConfig = computed(() => ({
    theme: this.theme(),
    documentManager: {
      initialDocuments: [
        {
          url: DEMO_DOCUMENT_URL,
          documentId: 'print-doc',
        },
      ],
    },
  }));

  onReady(registry: PluginRegistry) {
    this.registry.set(registry);
  }

  print() {
    const scope = this.docPrint();
    if (!scope || this.isPrinting()) return;

    this.isPrinting.set(true);
    scope.print().wait(
      () => this.isPrinting.set(false),
      (error) => {
        console.error('Print failed', error);
        this.isPrinting.set(false);
      },
    );
  }
}
