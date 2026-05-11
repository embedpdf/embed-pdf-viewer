import { ChangeDetectionStrategy, Component, computed, effect, signal } from '@angular/core';
import {
  createPluginCapabilitySignal,
  type CommandsPlugin,
  type GroupItem,
  type PluginRegistry,
  PDFViewer,
  provideEmbedPdfViewerConfig,
  type ToolbarItem,
  type UIPlugin,
} from '@embedpdf/angular-pdf-viewer';

import {
  ANGULAR_TAILWIND_THEME,
  DEMO_DOCUMENT_URL,
  createThemePreferenceSignal,
} from '../../example-support';

export const selector = 'ui-customization-example';

@Component({
  selector,
  imports: [PDFViewer],
  providers: [
    provideEmbedPdfViewerConfig({
      src: DEMO_DOCUMENT_URL,
      theme: ANGULAR_TAILWIND_THEME,
    }),
  ],
  template: `
    <div class="flex flex-col gap-4">
      <div
        class="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
      >
        <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <span
            class="inline-block h-2.5 w-2.5 rounded-full"
            [class.bg-emerald-500]="isReady()"
            [class.bg-amber-400]="!isReady()"
          ></span>
          {{
            isReady() ? 'Toolbar patched and command registered' : 'Waiting for plugin registry…'
          }}
        </div>
        @if (lastAction()) {
          <span
            class="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200"
          >
            {{ lastAction() }}
          </span>
        }
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
export default class UiCustomizationExample {
  readonly themePreference = createThemePreferenceSignal();
  readonly registry = signal<PluginRegistry | null>(null);
  readonly commands = createPluginCapabilitySignal<CommandsPlugin>(this.registry, 'commands');
  readonly ui = createPluginCapabilitySignal<UIPlugin>(this.registry, 'ui');
  readonly isReady = signal(false);
  readonly lastAction = signal<string | null>(null);
  readonly viewerConfig = computed(() => ({
    theme: {
      preference: this.themePreference(),
    },
  }));

  private toolbarCustomized = false;

  constructor() {
    effect(() => {
      const commands = this.commands();
      const ui = this.ui();
      if (!commands || !ui) return;

      if (!this.toolbarCustomized) {
        commands.registerCommand({
          id: 'angular.docs.welcome',
          label: 'Celebrate Angular',
          action: () => {
            this.lastAction.set('Angular command executed ✨');
            globalThis.setTimeout(() => this.lastAction.set(null), 1800);
          },
        });

        const schema = ui.getSchema();
        const mainToolbar = schema.toolbars['main-toolbar'];

        if (mainToolbar) {
          const items = structuredClone(mainToolbar.items) as ToolbarItem[];
          const rightGroup = items.find(
            (item): item is GroupItem => item.type === 'group' && item.id === 'right-group',
          );

          if (
            rightGroup &&
            !rightGroup.items.some((item) => item.id === 'angular-command-button')
          ) {
            rightGroup.items.unshift({
              type: 'command-button',
              id: 'angular-command-button',
              commandId: 'angular.docs.welcome',
              variant: 'icon',
            });
          }

          ui.mergeSchema({
            toolbars: {
              'main-toolbar': {
                ...mainToolbar,
                items,
              },
            },
          });
        }

        this.toolbarCustomized = true;
      }

      this.isReady.set(true);
    });
  }

  onReady(registry: PluginRegistry) {
    this.registry.set(registry);
  }
}
