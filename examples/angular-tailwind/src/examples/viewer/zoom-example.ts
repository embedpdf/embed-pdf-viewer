import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import {
  type PluginRegistry,
  PDFViewer,
  type ZoomPlugin,
  ZoomMode,
} from '@embedpdf/angular-pdf-viewer';

import { createThemeConfig, createThemePreferenceSignal } from '../../example-support';

export const selector = 'zoom-example';

@Component({
  selector,
  imports: [PDFViewer],
  template: `
    <section class="flex flex-col gap-4">
      <div
        class="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/80"
      >
        <span class="mr-2 text-sm font-medium text-slate-700 dark:text-slate-200"
          >External zoom controls</span
        >
        <button
          type="button"
          class="rounded-full bg-slate-200 px-3 py-1.5 text-sm font-medium text-slate-900 transition hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          (click)="zoomOut()"
        >
          Zoom out
        </button>
        <button
          type="button"
          class="rounded-full bg-slate-200 px-3 py-1.5 text-sm font-medium text-slate-900 transition hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          (click)="zoomIn()"
        >
          Zoom in
        </button>
        <button
          type="button"
          class="rounded-full bg-slate-200 px-3 py-1.5 text-sm font-medium text-slate-900 transition hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          (click)="fitWidth()"
        >
          Fit width
        </button>
        <button
          type="button"
          class="rounded-full bg-slate-200 px-3 py-1.5 text-sm font-medium text-slate-900 transition hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          (click)="fitPage()"
        >
          Fit page
        </button>
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
          url: 'https://snippet.embedpdf.com/ebook.pdf',
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
