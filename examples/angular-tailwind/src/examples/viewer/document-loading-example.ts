import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  signal,
} from '@angular/core';
import {
  createPluginCapabilitySignal,
  type DocumentManagerPlugin,
  PDFViewer,
  type PluginRegistry,
} from '@embedpdf/angular-pdf-viewer';

import {
  DEMO_DOCUMENT_URL,
  createThemeConfig,
  createThemePreferenceSignal,
} from '../../example-support';

export const selector = 'document-loading-example';

@Component({
  selector,
  imports: [PDFViewer],
  template: `
    <div class="flex flex-col gap-4">
      <div
        class="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
      >
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="rounded-md bg-white px-3 py-2 text-sm font-medium shadow-sm transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:hover:bg-gray-600"
            [disabled]="!isReady()"
            (click)="openRemoteDocument()"
          >
            Load URL
          </button>

          <label
            class="cursor-pointer rounded-md bg-white px-3 py-2 text-sm font-medium shadow-sm transition hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600"
            [class.pointer-events-none]="!isReady()"
            [class.opacity-50]="!isReady()"
          >
            Upload local
            <input
              type="file"
              class="hidden"
              accept=".pdf"
              [disabled]="!isReady()"
              (change)="onFileSelected($event)"
            />
          </label>
        </div>

        <div class="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
          <span>Open documents: {{ documents().length }}</span>
          <label class="flex items-center gap-2">
            Active document
            <select
              class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700"
              [value]="activeDocumentId() || ''"
              [disabled]="documents().length === 0"
              (change)="setActiveDocument($event)"
            >
              <option value="" disabled>Select document…</option>
              @for (document of documents(); track document.id) {
                <option [value]="document.id">{{ document.name }}</option>
              }
            </select>
          </label>
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
export default class DocumentLoadingExample {
  readonly themePreference = createThemePreferenceSignal();
  readonly theme = createThemeConfig(this.themePreference);
  readonly documents = signal<Array<{ id: string; name: string }>>([]);
  readonly activeDocumentId = signal<string | null>(null);
  readonly registry = signal<PluginRegistry | null>(null);
  readonly documentManager = createPluginCapabilitySignal<DocumentManagerPlugin>(
    this.registry,
    'document-manager',
  );
  readonly isReady = computed(() => this.documentManager() !== null);
  readonly viewerConfig = computed(() => ({
    theme: this.theme(),
    tabBar: 'always' as const,
    documentManager: {
      maxDocuments: 5,
    },
  }));

  constructor() {
    effect((onCleanup) => {
      const documentManager = this.documentManager();
      if (!documentManager) {
        this.documents.set([]);
        this.activeDocumentId.set(null);
        return;
      }

      const updateDocuments = () => {
        const openDocuments = documentManager.getOpenDocuments();
        this.documents.set(
          openDocuments.map((document) => ({ id: document.id, name: document.name || 'Untitled' })),
        );
        this.activeDocumentId.set(documentManager.getActiveDocumentId());
      };

      const cleanups = [
        documentManager.onDocumentOpened(updateDocuments),
        documentManager.onDocumentClosed(updateDocuments),
        documentManager.onActiveDocumentChanged((event) => {
          this.activeDocumentId.set(event.currentDocumentId);
        }),
      ];

      updateDocuments();
      onCleanup(() => cleanups.forEach((cleanup) => cleanup()));
    });
  }

  onReady(registry: PluginRegistry) {
    this.registry.set(registry);
  }

  openRemoteDocument() {
    this.documentManager()?.openDocumentUrl({
        url: DEMO_DOCUMENT_URL,
        documentId: `ebook-demo-${Date.now()}`,
        name: 'EmbedPDF ebook',
      });
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const buffer = await file.arrayBuffer();
    this.documentManager()?.openDocumentBuffer({
        buffer,
        name: file.name,
        autoActivate: true,
      });

    input.value = '';
  }

  setActiveDocument(event: Event) {
    const documentId = (event.target as HTMLSelectElement).value;
    this.documentManager()?.setActiveDocument(documentId);
  }
}
