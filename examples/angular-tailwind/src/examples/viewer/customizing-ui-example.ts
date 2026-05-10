import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import {
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

export const selector = 'customizing-ui-example';

@Component({
  selector,
  imports: [PDFViewer],
  providers: [
    ...provideEmbedPdfViewerConfig({
      src: DEMO_DOCUMENT_URL,
      theme: {
        preference: 'light',
        ...ANGULAR_TAILWIND_THEME,
      },
    }),
  ],
  template: `
    <section class="flex flex-col gap-4">
      <div
        class="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/80"
      >
        <div class="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
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
export default class CustomizingUiExample {
  readonly themePreference = createThemePreferenceSignal();
  readonly isReady = signal(false);
  readonly lastAction = signal<string | null>(null);
  readonly viewerConfig = computed(() => ({
    theme: {
      preference: this.themePreference(),
    },
  }));

  onReady(registry: PluginRegistry) {
    const commands = registry.getPlugin<CommandsPlugin>('commands')?.provides();
    const ui = registry.getPlugin<UIPlugin>('ui')?.provides();

    if (!commands || !ui) return;

    commands.registerCommand({
      id: 'angular.docs.welcome',
      label: 'Celebrate Angular',
      icon: 'help-circle',
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

      if (rightGroup && !rightGroup.items.some((item) => item.id === 'angular-command-button')) {
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

    this.isReady.set(true);
  }
}
