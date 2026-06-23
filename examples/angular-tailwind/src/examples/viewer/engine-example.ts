import { ChangeDetectionStrategy, Component, computed, resource, signal } from '@angular/core';
import {
  createPluginCapabilitySignal,
  type DocumentManagerPlugin,
  type PluginRegistry,
  PDFViewer,
} from '@embedpdf/angular-pdf-viewer';

import { createDefaultViewerConfig, createThemePreferenceSignal } from '../../example-support';

export const selector = 'engine-example';

@Component({
  selector,
  imports: [PDFViewer],
  template: `
    <section class="flex flex-col gap-4">
      <div
        class="flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
      >
        <button
          type="button"
          class="rounded-full bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-60"
          [disabled]="inspection.isLoading() || !registryReady()"
          (click)="inspect()"
        >
          {{ inspection.isLoading() ? 'Loading…' : 'Inspect active document' }}
        </button>

        <div class="grid gap-1 text-sm text-gray-600 sm:grid-cols-2 sm:gap-x-6 dark:text-gray-300">
          <p>
            <span class="font-medium text-gray-900 dark:text-gray-100">Pages:</span>
            {{ inspection.value()?.pageCount ?? '—' }}
          </p>
          <p>
            <span class="font-medium text-gray-900 dark:text-gray-100">Title:</span>
            {{ inspection.value()?.metadata?.title || '—' }}
          </p>
          <p>
            <span class="font-medium text-gray-900 dark:text-gray-100">Author:</span>
            {{ inspection.value()?.metadata?.author || '—' }}
          </p>
          <p>
            <span class="font-medium text-gray-900 dark:text-gray-100">Created:</span>
            {{ formatDate(inspection.value()?.metadata?.creationDate) }}
          </p>
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
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class EngineExample {
  readonly themePreference = createThemePreferenceSignal();
  readonly viewerConfig = createDefaultViewerConfig(this.themePreference);
  readonly registry = signal<PluginRegistry | null>(null);
  readonly documentManager = createPluginCapabilitySignal<DocumentManagerPlugin>(
    this.registry,
    'document-manager',
  );
  readonly registryReady = computed(() => this.documentManager() !== null);

  // Bumped on each click to re-trigger the resource loader.
  private readonly inspectionToken = signal(0);

  readonly inspection = resource({
    params: () => ({
      token: this.inspectionToken(),
      registry: this.registry(),
      documentManager: this.documentManager(),
    }),
    loader: async ({ params }) => {
      if (params.token === 0 || !params.registry || !params.documentManager) return null;

      const engine = params.registry.getEngine();
      const document = params.documentManager.getActiveDocument();

      if (!engine || !document) return null;

      return {
        pageCount: document.pageCount,
        metadata: await engine.getMetadata(document).toPromise(),
      };
    },
  });

  onReady(registry: PluginRegistry) {
    this.registry.set(registry);
  }

  inspect() {
    this.inspectionToken.update((n) => n + 1);
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
