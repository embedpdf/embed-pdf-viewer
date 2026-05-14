import { ChangeDetectionStrategy, Component, computed, effect, signal } from '@angular/core';
import {
  type AnnotationPlugin,
  createPluginCapabilitySignal,
  PDFViewer,
  type PluginRegistry,
} from '@embedpdf/angular-pdf-viewer';

import {
  DEMO_DOCUMENT_URL,
  createThemeConfig,
  createThemePreferenceSignal,
} from '../../example-support';

const TOOLS = [
  { id: null, label: 'Select' },
  { id: 'highlight', label: 'Highlight' },
  { id: 'ink', label: 'Ink' },
  { id: 'square', label: 'Square' },
] as const;

export const selector = 'annotation-example';

@Component({
  selector,
  imports: [PDFViewer],
  template: `
    <div class="flex flex-col gap-4">
      <div
        class="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800"
      >
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-gray-600 dark:text-gray-300">Tools:</span>
            <div class="flex gap-1">
              @for (tool of tools; track tool.label) {
                <button
                  type="button"
                  [title]="tool.label"
                  class="rounded px-2.5 py-1.5 text-sm transition-colors"
                  [class.bg-white]="activeTool() === tool.id"
                  [class.text-blue-600]="activeTool() === tool.id"
                  [class.shadow-sm]="activeTool() === tool.id"
                  [class.dark:bg-gray-700]="activeTool() === tool.id"
                  [class.dark:text-blue-400]="activeTool() === tool.id"
                  [class.text-gray-600]="activeTool() !== tool.id"
                  [class.hover:bg-gray-200]="activeTool() !== tool.id"
                  [class.dark:text-gray-400]="activeTool() !== tool.id"
                  [class.dark:hover:bg-gray-700]="activeTool() !== tool.id"
                  (click)="setTool(tool.id)"
                >
                  {{ tool.label }}
                </button>
              }
            </div>
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">Log: {{ lastEvent() }}</div>
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
export default class AnnotationExample {
  readonly themePreference = createThemePreferenceSignal();
  readonly theme = createThemeConfig(this.themePreference);
  readonly registry = signal<PluginRegistry | null>(null);
  readonly tools = TOOLS;
  readonly annotationCapability = createPluginCapabilitySignal<AnnotationPlugin>(
    this.registry,
    'annotation',
  );
  readonly activeTool = signal<string | null>(null);
  readonly lastEvent = signal('Ready');
  readonly viewerConfig = computed(() => ({
    theme: this.theme(),
    annotations: {
      annotationAuthor: 'Guest User',
      selectAfterCreate: true,
    },
    documentManager: {
      initialDocuments: [
        {
          url: DEMO_DOCUMENT_URL,
          documentId: 'annotation-doc',
        },
      ],
    },
  }));

  constructor() {
    effect((onCleanup) => {
      const capability = this.annotationCapability();
      if (!capability) {
        this.activeTool.set(null);
        return;
      }

      const cleanups = [
        capability.onActiveToolChange(({ tool }) => {
          this.activeTool.set(tool?.id ?? null);
        }),
        capability.onAnnotationEvent((event) => {
          if (event.type === 'create') {
            this.lastEvent.set(`Created annotation on page ${event.pageIndex + 1}`);
          } else if (event.type === 'delete') {
            this.lastEvent.set(`Deleted annotation from page ${event.pageIndex + 1}`);
          }
        }),
      ];
      onCleanup(() => cleanups.forEach((cleanup) => cleanup()));
    });
  }

  onReady(registry: PluginRegistry) {
    this.registry.set(registry);
  }

  setTool(toolId: string | null) {
    this.annotationCapability()?.setActiveTool(toolId);
  }
}
