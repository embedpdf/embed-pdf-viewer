import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  PDFViewer,
  type PluginRegistry,
  type SelectionPlugin,
  type SelectionScope,
} from '@embedpdf/angular-pdf-viewer';

import {
  DEMO_DOCUMENT_URL,
  createThemeConfig,
  createThemePreferenceSignal,
} from '../../example-support';

export const selector = 'selection-example';

@Component({
  selector,
  imports: [PDFViewer],
  template: `
    <div class="flex flex-col gap-4">
      <div
        class="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
      >
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="flex items-center gap-2 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-gray-700 dark:disabled:text-gray-500"
              [disabled]="!hasSelection()"
              (click)="copy()"
            >
              Copy
            </button>
            <button
              type="button"
              class="flex items-center gap-2 rounded bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              [disabled]="!hasSelection()"
              (click)="clear()"
            >
              Clear
            </button>
          </div>
          @if (lastAction()) {
            <span class="text-sm text-green-600 dark:text-green-400">{{ lastAction() }}</span>
          }
        </div>
        <div class="text-xs text-gray-500">Select text in the PDF to enable buttons</div>
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
export default class SelectionExample {
  private readonly destroyRef = inject(DestroyRef);
  readonly themePreference = createThemePreferenceSignal();
  readonly theme = createThemeConfig(this.themePreference);
  readonly selection = signal<SelectionScope | null>(null);
  readonly hasSelection = signal(false);
  readonly lastAction = signal<string | null>(null);
  readonly viewerConfig = computed(() => ({
    theme: this.theme(),
    documentManager: {
      initialDocuments: [
        {
          url: DEMO_DOCUMENT_URL,
          documentId: 'selection-doc',
        },
      ],
    },
  }));

  onReady(registry: PluginRegistry) {
    const scope = registry
      .getPlugin<SelectionPlugin>('selection')
      ?.provides()
      ?.forDocument('selection-doc');
    if (!scope) return;

    this.selection.set(scope);
    const cleanup = scope.onSelectionChange((current) => {
      this.hasSelection.set(!!current);
    });
    this.destroyRef.onDestroy(cleanup);
  }

  copy() {
    this.selection()?.copyToClipboard();
    this.flash('Copied to clipboard!');
  }

  clear() {
    this.selection()?.clear();
    this.flash('Selection cleared');
  }

  private flash(message: string) {
    this.lastAction.set(message);
    globalThis.setTimeout(() => this.lastAction.set(null), 2000);
  }
}
