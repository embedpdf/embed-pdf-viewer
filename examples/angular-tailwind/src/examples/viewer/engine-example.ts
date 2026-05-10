import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import {
  type DocumentManagerPlugin,
  type PluginRegistry,
  PDFViewer,
} from '@embedpdf/angular-pdf-viewer';

import { createDefaultViewerConfig, createThemePreferenceSignal } from '../../example-support';

@Component({
  selector: 'engine-example',
  imports: [PDFViewer],
  template: `
    <section class="flex flex-col gap-4">
      <div
        class="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/80"
      >
        <button
          type="button"
          class="rounded-full bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-60"
          [disabled]="loading() || !registryReady()"
          (click)="loadMetadata()"
        >
          {{ loading() ? 'Loading…' : 'Inspect active document' }}
        </button>

        <div
          class="grid gap-1 text-sm text-slate-600 sm:grid-cols-2 sm:gap-x-6 dark:text-slate-300"
        >
          <p>
            <span class="font-medium text-slate-900 dark:text-slate-100">Pages:</span>
            {{ pageCount() ?? '—' }}
          </p>
          <p>
            <span class="font-medium text-slate-900 dark:text-slate-100">Title:</span>
            {{ metadata()?.title || '—' }}
          </p>
          <p>
            <span class="font-medium text-slate-900 dark:text-slate-100">Author:</span>
            {{ metadata()?.author || '—' }}
          </p>
          <p>
            <span class="font-medium text-slate-900 dark:text-slate-100">Created:</span>
            {{ formatDate(metadata()?.creationDate) }}
          </p>
        </div>
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
export default class EngineExample {
  readonly themePreference = createThemePreferenceSignal();
  readonly viewerConfig = createDefaultViewerConfig(this.themePreference);
  readonly registryReady = signal(false);
  readonly registry = signal<PluginRegistry | null>(null);
  readonly loading = signal(false);
  readonly pageCount = signal<number | null>(null);
  readonly metadata = signal<{
    title?: string | null;
    author?: string | null;
    creationDate?: Date | null;
  } | null>(null);

  onReady(registry: PluginRegistry) {
    this.registry.set(registry);
    this.registryReady.set(true);
  }

  async loadMetadata() {
    const registry = this.registry();
    if (!registry) return;

    this.loading.set(true);

    try {
      const documentManager = registry
        .getPlugin<DocumentManagerPlugin>('document-manager')
        ?.provides();
      const engine = registry.getEngine();
      const document = documentManager?.getActiveDocument();

      if (engine && document) {
        this.pageCount.set(document.pageCount);
        this.metadata.set(await engine.getMetadata(document).toPromise());
      }
    } finally {
      this.loading.set(false);
    }
  }

  formatDate(date?: Date | null) {
    if (!date) return '—';

    return new Date(date).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
}
