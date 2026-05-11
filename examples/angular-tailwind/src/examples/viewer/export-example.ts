import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import {
  type ExportPlugin,
  type ExportScope,
  PDFViewer,
  type PluginRegistry,
} from '@embedpdf/angular-pdf-viewer';

import {
  DEMO_DOCUMENT_URL,
  createThemeConfig,
  createThemePreferenceSignal,
} from '../../example-support';

type SaveStatus = 'idle' | 'success';

export const selector = 'export-example';

@Component({
  selector,
  imports: [PDFViewer],
  template: `
    <div class="flex flex-col gap-4">
      <div
        class="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
      >
        <button
          type="button"
          class="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
          (click)="download()"
        >
          ⬇ Download PDF
        </button>

        <div class="h-6 w-px bg-gray-300 dark:bg-gray-600"></div>

        <button
          type="button"
          class="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          [disabled]="isSaving()"
          (click)="saveToServer()"
        >
          {{
            isSaving() ? 'Saving…' : saveStatus() === 'success' ? '✓ Saved!' : '☁ Save to Server'
          }}
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
export default class ExportExample {
  readonly themePreference = createThemePreferenceSignal();
  readonly theme = createThemeConfig(this.themePreference);
  readonly exportScope = signal<ExportScope | null>(null);
  readonly isSaving = signal(false);
  readonly saveStatus = signal<SaveStatus>('idle');
  readonly viewerConfig = computed(() => ({
    theme: this.theme(),
    documentManager: {
      initialDocuments: [
        {
          url: DEMO_DOCUMENT_URL,
          documentId: 'export-doc',
        },
      ],
    },
    export: {
      defaultFileName: 'my-ebook.pdf',
    },
  }));

  onReady(registry: PluginRegistry) {
    const scope = registry
      .getPlugin<ExportPlugin>('export')
      ?.provides()
      ?.forDocument('export-doc');
    if (scope) this.exportScope.set(scope);
  }

  download() {
    this.exportScope()?.download();
  }

  async saveToServer() {
    const scope = this.exportScope();
    if (!scope) return;

    this.isSaving.set(true);
    try {
      const arrayBuffer = await scope.saveAsCopy().toPromise();
      const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
      const file = new File([blob], 'saved-document.pdf');

      // Simulated upload
      await new Promise((resolve) => globalThis.setTimeout(resolve, 1500));
      console.log(`Successfully prepared ${file.size} bytes for upload.`);

      this.saveStatus.set('success');
      globalThis.setTimeout(() => this.saveStatus.set('idle'), 3000);
    } finally {
      this.isSaving.set(false);
    }
  }
}
