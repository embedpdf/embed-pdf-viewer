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
  type ScrollCapability,
  type ScrollPlugin,
} from '@embedpdf/angular-pdf-viewer';

import {
  DEMO_DOCUMENT_URL,
  createThemeConfig,
  createThemePreferenceSignal,
} from '../../example-support';

export const selector = 'scroll-example';

@Component({
  selector,
  imports: [PDFViewer],
  template: `
    <div class="flex flex-col gap-4">
      <div
        class="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
      >
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded p-2 hover:bg-gray-200 disabled:opacity-50 dark:hover:bg-gray-700"
            [disabled]="currentPage() <= 1"
            (click)="previousPage()"
          >
            ←
          </button>
          <span class="font-mono text-sm font-medium">
            Page {{ currentPage() }} / {{ totalPages() }}
          </span>
          <button
            type="button"
            class="rounded p-2 hover:bg-gray-200 disabled:opacity-50 dark:hover:bg-gray-700"
            [disabled]="currentPage() >= totalPages()"
            (click)="nextPage()"
          >
            →
          </button>
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
export default class ScrollExample {
  private readonly destroyRef = inject(DestroyRef);
  readonly themePreference = createThemePreferenceSignal();
  readonly theme = createThemeConfig(this.themePreference);
  readonly scroll = signal<ScrollCapability | null>(null);
  readonly currentPage = signal(1);
  readonly totalPages = signal(1);
  readonly viewerConfig = computed(() => ({
    theme: this.theme(),
    scroll: {
      defaultPageGap: 20,
    },
    documentManager: {
      initialDocuments: [
        {
          url: DEMO_DOCUMENT_URL,
          documentId: 'scroll-doc',
        },
      ],
    },
  }));

  onReady(registry: PluginRegistry) {
    const scrollCapability = registry.getPlugin<ScrollPlugin>('scroll')?.provides();
    if (!scrollCapability) return;

    this.scroll.set(scrollCapability);

    const cleanups = [
      scrollCapability.onLayoutReady((event) => {
        this.currentPage.set(event.pageNumber);
        this.totalPages.set(event.totalPages);
      }),
      scrollCapability.onPageChange((event) => {
        this.currentPage.set(event.pageNumber);
        this.totalPages.set(event.totalPages);
      }),
    ];
    this.destroyRef.onDestroy(() => cleanups.forEach((cleanup) => cleanup()));
  }

  previousPage() {
    this.scroll()?.forDocument('scroll-doc').scrollToPreviousPage();
  }

  nextPage() {
    this.scroll()?.forDocument('scroll-doc').scrollToNextPage();
  }
}
