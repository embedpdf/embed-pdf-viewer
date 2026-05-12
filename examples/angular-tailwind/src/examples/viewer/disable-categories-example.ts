import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  signal,
} from '@angular/core';
import {
  createPluginCapabilitySignal,
  type CommandsPlugin,
  PDFViewer,
  type PluginRegistry,
  type UIPlugin,
} from '@embedpdf/angular-pdf-viewer';

import {
  DEMO_DOCUMENT_URL,
  createThemeConfig,
  createThemePreferenceSignal,
} from '../../example-support';

export const selector = 'disable-categories-example';

const VIEWER_CATEGORIES = [
  { id: 'annotation', label: 'Annotations' },
  { id: 'form', label: 'Forms' },
  { id: 'redaction', label: 'Redaction' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'document-print', label: 'Print' },
  { id: 'document-export', label: 'Export' },
  { id: 'panel', label: 'Sidebars' },
] as const;

@Component({
  selector,
  imports: [PDFViewer],
  template: `
    <div class="flex flex-col gap-4">
      <div
        class="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
      >
        <div class="space-y-1">
          <h3 class="font-medium text-gray-900 dark:text-gray-100">Disable viewer categories</h3>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Toggle UI and command categories to match the React, Vue, and Svelte examples.
          </p>
        </div>

        <div class="flex flex-wrap gap-4">
          @for (category of categories; track category.id) {
            <label
              class="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
            >
              <input
                type="checkbox"
                class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                [checked]="disabledCategories().includes(category.id)"
                (change)="toggleCategory(category.id)"
              />
              {{ category.label }}
            </label>
          }
        </div>

        <div class="text-xs text-gray-500 dark:text-gray-400">
          Selected:
          {{ disabledCategories().length > 0 ? disabledCategories().join(', ') : '(none)' }}
        </div>
      </div>

      <div
        class="h-[600px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600"
      >
        <embedpdf-viewer class="block h-full w-full" [config]="viewerConfig()" (ready)="onReady($event)" />
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class DisableCategoriesExample {
  readonly categories = VIEWER_CATEGORIES;
  readonly themePreference = createThemePreferenceSignal();
  readonly theme = createThemeConfig(this.themePreference);
  readonly registry = signal<PluginRegistry | null>(null);
  readonly commands = createPluginCapabilitySignal<CommandsPlugin>(this.registry, 'commands');
  readonly ui = createPluginCapabilitySignal<UIPlugin>(this.registry, 'ui');
  readonly disabledCategories = signal<string[]>([]);
  readonly viewerConfig = computed(() => ({
    src: DEMO_DOCUMENT_URL,
    theme: this.theme(),
    disabledCategories: this.disabledCategories(),
  }));

  constructor() {
    effect(() => {
      const categories = this.disabledCategories();

      this.commands()?.setDisabledCategories(categories);
      this.ui()?.setDisabledCategories(categories);
    });
  }

  onReady(registry: PluginRegistry) {
    this.registry.set(registry);
  }

  toggleCategory(categoryId: string) {
    this.disabledCategories.update((categories) =>
      categories.includes(categoryId)
        ? categories.filter((id) => id !== categoryId)
        : [...categories, categoryId],
    );
  }
}
