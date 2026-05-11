import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import {
  type PluginRegistry,
  PDFViewer,
  type ZoomPlugin,
  ZoomMode,
} from '@embedpdf/angular-pdf-viewer';

import {
  DEMO_DOCUMENT_URL,
  createThemeConfig,
  createThemePreferenceSignal,
} from '../../example-support';

export const selector = 'zoom-example';

@Component({
  selector,
  imports: [PDFViewer],
  template: `
    <div class="flex flex-col gap-4">
      <div
        class="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800"
      >
        <span class="px-2 text-sm font-medium text-gray-600 dark:text-gray-300">
          External zoom controls:
        </span>
        <button
          type="button"
          class="rounded px-3 py-1.5 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700"
          (click)="zoomOut()"
        >
          Zoom out
        </button>
        <button
          type="button"
          class="rounded px-3 py-1.5 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700"
          (click)="zoomIn()"
        >
          Zoom in
        </button>
        <button
          type="button"
          class="rounded px-3 py-1.5 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700"
          (click)="fitWidth()"
        >
          Fit width
        </button>
        <button
          type="button"
          class="rounded px-3 py-1.5 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700"
          (click)="fitPage()"
        >
          Fit page
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
export default class ZoomExample {
  readonly themePreference = createThemePreferenceSignal();
  readonly theme = createThemeConfig(this.themePreference);
  readonly registry = signal<PluginRegistry | null>(null);
  readonly viewerConfig = computed(() => ({
    theme: this.theme(),
    zoom: {
      defaultZoomLevel: ZoomMode.FitPage,
    },
    documentManager: {
      initialDocuments: [
        {
          url: DEMO_DOCUMENT_URL,
          documentId: 'zoom-doc',
        },
      ],
    },
  }));

  onReady(registry: PluginRegistry) {
    this.registry.set(registry);
  }

  private zoomPlugin() {
    return this.registry()?.getPlugin<ZoomPlugin>('zoom')?.provides();
  }

  zoomIn() {
    this.zoomPlugin()?.forDocument('zoom-doc').zoomIn();
  }

  zoomOut() {
    this.zoomPlugin()?.forDocument('zoom-doc').zoomOut();
  }

  fitWidth() {
    this.zoomPlugin()?.forDocument('zoom-doc').requestZoom(ZoomMode.FitWidth);
  }

  fitPage() {
    this.zoomPlugin()?.forDocument('zoom-doc').requestZoom(ZoomMode.FitPage);
  }
}
