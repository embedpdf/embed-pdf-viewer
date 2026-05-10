import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  type DocumentManagerPlugin,
  PDFViewer,
  type PluginRegistry,
} from '@embedpdf/angular-pdf-viewer';

import { createThemeConfig, createThemePreferenceSignal } from '../../example-support';

@Component({
  selector: 'document-manager-example',
  imports: [PDFViewer],
  template: `
    <section class="flex flex-col gap-4">
      <div
        class="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/80"
      >
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="rounded-full bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-60"
            [disabled]="!isReady()"
            (click)="openRemoteDocument()"
          >
            Open remote sample
          </button>
          <label
            class="rounded-full bg-slate-200 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            Upload local PDF
            <input type="file" class="hidden" accept=".pdf" (change)="onFileSelected($event)" />
          </label>
        </div>

        <label class="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          Active document
          <select
            class="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
            [value]="activeDocumentId() || ''"
            [disabled]="documents().length === 0"
            (change)="setActiveDocument($event)"
          >
            <option value="" disabled>Select a document</option>
            @for (document of documents(); track document.id) {
              <option [value]="document.id">{{ document.name }}</option>
            }
          </select>
        </label>
      </div>

      <div
        class="h-[620px] overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-950"
      >
        <embedpdf-viewer
          class="h-full w-full"
          [config]="viewerConfig()"
          (ready)="onReady($event)"
        />
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class DocumentManagerExample {
  readonly themePreference = createThemePreferenceSignal();
  readonly theme = createThemeConfig(this.themePreference);
  readonly destroyRef = inject(DestroyRef);
  readonly documents = signal<Array<{ id: string; name: string }>>([]);
  readonly activeDocumentId = signal<string | null>(null);
  readonly registry = signal<PluginRegistry | null>(null);
  readonly isReady = computed(() => this.registry() !== null);
  readonly viewerConfig = computed(() => ({
    theme: this.theme(),
    tabBar: 'always',
    documentManager: {
      maxDocuments: 5,
      initialDocuments: [
        {
          url: 'https://snippet.embedpdf.com/ebook.pdf',
          documentId: 'ebook-demo',
          name: 'EmbedPDF ebook',
        },
      ],
    },
  }));

  onReady(registry: PluginRegistry) {
    this.registry.set(registry);
    const documentManager = registry
      .getPlugin<DocumentManagerPlugin>('document-manager')
      ?.provides();
    if (!documentManager) return;

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
    this.destroyRef.onDestroy(() => cleanups.forEach((cleanup) => cleanup()));
  }

  openRemoteDocument() {
    this.registry()
      ?.getPlugin<DocumentManagerPlugin>('document-manager')
      ?.provides()
      .openDocumentUrl({
        url: 'https://snippet.embedpdf.com/ebook.pdf',
        documentId: `ebook-copy-${Date.now()}`,
        name: 'Remote ebook copy',
      });
  }

  async onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const buffer = await file.arrayBuffer();
    this.registry()
      ?.getPlugin<DocumentManagerPlugin>('document-manager')
      ?.provides()
      .openDocumentBuffer({
        buffer,
        name: file.name,
        autoActivate: true,
      });

    (event.target as HTMLInputElement).value = '';
  }

  setActiveDocument(event: Event) {
    const documentId = (event.target as HTMLSelectElement).value;
    this.registry()
      ?.getPlugin<DocumentManagerPlugin>('document-manager')
      ?.provides()
      .setActiveDocument(documentId);
  }
}
