import { ChangeDetectionStrategy, Component, computed, effect, signal } from '@angular/core';
import {
  createDocumentScopeSignal,
  createPluginCapabilitySignal,
  PDFViewer,
  type PluginRegistry,
  type RotatePlugin,
} from '@embedpdf/angular-pdf-viewer';

import {
  DEMO_DOCUMENT_URL,
  createThemeConfig,
  createThemePreferenceSignal,
} from '../../example-support';

export const selector = 'rotate-example';

@Component({
  selector,
  imports: [PDFViewer],
  template: `
    <div class="flex flex-col gap-4">
      <div
        class="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
      >
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <button
              type="button"
              aria-label="Rotate counter-clockwise"
              title="Rotate Counter-Clockwise"
              class="rounded p-2 hover:bg-gray-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 dark:hover:bg-gray-700 dark:focus-visible:outline-blue-400"
              [disabled]="!rotate()"
              (click)="rotateCcw()"
            >
              ↺
            </button>
            <button
              type="button"
              aria-label="Rotate clockwise"
              title="Rotate Clockwise"
              class="rounded p-2 hover:bg-gray-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 dark:hover:bg-gray-700 dark:focus-visible:outline-blue-400"
              [disabled]="!rotate()"
              (click)="rotateCw()"
            >
              ↻
            </button>
          </div>
          <span class="font-mono text-sm font-medium text-gray-600 dark:text-gray-300">
            Rotation: {{ currentRotation() * 90 }}°
          </span>
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
export default class RotateExample {
  readonly themePreference = createThemePreferenceSignal();
  readonly theme = createThemeConfig(this.themePreference);
  readonly registry = signal<PluginRegistry | null>(null);
  readonly rotatePlugin = createPluginCapabilitySignal<RotatePlugin>(this.registry, 'rotate');
  readonly rotate = createDocumentScopeSignal(this.rotatePlugin, 'rotate-doc');
  readonly currentRotation = signal(0);
  readonly viewerConfig = computed(() => ({
    theme: this.theme(),
    documentManager: {
      initialDocuments: [
        {
          url: DEMO_DOCUMENT_URL,
          documentId: 'rotate-doc',
        },
      ],
    },
  }));

  constructor() {
    effect((onCleanup) => {
      const docRotate = this.rotate();
      if (!docRotate) {
        this.currentRotation.set(0);
        return;
      }

      this.currentRotation.set(docRotate.getRotation());

      const cleanup = docRotate.onRotateChange((rotation) => {
        this.currentRotation.set(rotation);
      });
      onCleanup(cleanup);
    });
  }

  onReady(registry: PluginRegistry) {
    this.registry.set(registry);
  }

  rotateCw() {
    this.rotate()?.rotateForward();
  }

  rotateCcw() {
    this.rotate()?.rotateBackward();
  }
}
