import { ChangeDetectionStrategy, Component, computed, effect, signal } from '@angular/core';
import {
  createDocumentScopeSignal,
  createPluginCapabilitySignal,
  PDFViewer,
  type PluginRegistry,
  type ScrollPlugin,
} from '@embedpdf/angular-pdf-viewer';

import {
  DEMO_DOCUMENT_URL,
  createThemeConfig,
  createThemePreferenceSignal,
} from '../../example-support';

export const selector = 'scroll-initial-page-example';

@Component({
  selector,
  imports: [PDFViewer],
  template: `
    <div class="flex flex-col gap-4">
      <div
        class="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
      >
        <div class="relative flex h-2 w-2">
          <span
            class="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"
          ></span>
          <span class="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
        </div>
        <span class="font-mono text-sm text-gray-700 dark:text-gray-300">
          {{ status() }}
        </span>
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
export default class ScrollInitialPageExample {
  readonly themePreference = createThemePreferenceSignal();
  readonly theme = createThemeConfig(this.themePreference);
  readonly registry = signal<PluginRegistry | null>(null);
  readonly scroll = createPluginCapabilitySignal<ScrollPlugin>(this.registry, 'scroll');
  readonly docScroll = createDocumentScopeSignal(this.scroll, 'scroll-initial-page-doc');
  readonly status = signal('Loading layout…');
  readonly viewerConfig = computed(() => ({
    theme: this.theme(),
    documentManager: {
      initialDocuments: [
        {
          url: DEMO_DOCUMENT_URL,
          documentId: 'scroll-initial-page-doc',
        },
      ],
    },
  }));

  constructor() {
    effect((onCleanup) => {
      const scrollCapability = this.scroll();
      const docScroll = this.docScroll();
      if (!scrollCapability || !docScroll) return;

      const cleanup = scrollCapability.onLayoutReady((event) => {
        if (event.documentId !== 'scroll-initial-page-doc' || !event.isInitial) return;

        this.status.set('Layout ready. Jumping to page 3…');
        setTimeout(() => {
          docScroll.scrollToPage({
            pageNumber: 3,
            behavior: 'instant',
          });
          this.status.set('Scrolled to page 3');
        }, 0);
      });

      onCleanup(cleanup);
    });
  }

  onReady(registry: PluginRegistry) {
    this.registry.set(registry);
  }
}
