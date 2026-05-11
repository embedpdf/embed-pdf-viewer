import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  type FormFieldInfo,
  type FormPlugin,
  PDFViewer,
  type PluginRegistry,
} from '@embedpdf/angular-pdf-viewer';

import { createThemeConfig, createThemePreferenceSignal } from '../../example-support';

const DOCUMENT_ID = 'form-doc';

export const selector = 'form-example';

@Component({
  selector,
  imports: [PDFViewer],
  template: `
    <div class="flex flex-col gap-4">
      <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div
          class="h-[600px] overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600"
        >
          <embedpdf-viewer
            class="block h-full w-full"
            [config]="viewerConfig()"
            (ready)="onReady($event)"
          />
        </div>

        <div
          class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
        >
          <div
            class="border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800"
          >
            <h4 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Form State</h4>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Fill the PDF on the left to watch the values update live.
            </p>
          </div>

          <div
            class="grid grid-cols-3 border-b border-gray-200 bg-gray-50 text-xs dark:border-gray-700 dark:bg-gray-800"
          >
            <div class="px-4 py-3">
              <div class="text-gray-500 dark:text-gray-400">Fields</div>
              <div class="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                {{ fields().length }}
              </div>
            </div>
            <div class="border-x border-gray-200 px-4 py-3 dark:border-gray-700">
              <div class="text-gray-500 dark:text-gray-400">Filled</div>
              <div class="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                {{ filledFieldCount() }}
              </div>
            </div>
            <div class="px-4 py-3">
              <div class="text-gray-500 dark:text-gray-400">Changes</div>
              <div class="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                {{ changeCount() }}
              </div>
            </div>
          </div>

          <div class="max-h-[340px] overflow-auto p-4">
            @if (hasValues()) {
              <pre class="text-xs text-gray-800 dark:text-gray-300">{{ formValuesJson() }}</pre>
            } @else {
              <p class="text-sm italic text-gray-400 dark:text-gray-500">
                Waiting for form fields…
              </p>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class FormExample {
  private readonly destroyRef = inject(DestroyRef);
  readonly themePreference = createThemePreferenceSignal();
  readonly theme = createThemeConfig(this.themePreference);
  readonly fields = signal<FormFieldInfo[]>([]);
  readonly formValues = signal<Record<string, string>>({});
  readonly changeCount = signal(0);
  readonly filledFieldCount = computed(
    () =>
      Object.values(this.formValues()).filter((value) => value !== '' && value !== 'Off').length,
  );
  readonly hasValues = computed(() => Object.keys(this.formValues()).length > 0);
  readonly formValuesJson = computed(() => JSON.stringify(this.formValues(), null, 2));
  readonly viewerConfig = computed(() => ({
    theme: this.theme(),
    documentManager: {
      initialDocuments: [
        {
          url: '/form.pdf',
          documentId: DOCUMENT_ID,
        },
      ],
    },
    export: {
      defaultFileName: 'filled-form.pdf',
    },
  }));

  onReady(registry: PluginRegistry) {
    const scope = registry.getPlugin<FormPlugin>('form')?.provides()?.forDocument(DOCUMENT_ID);
    if (!scope) return;

    const syncValues = () => {
      this.formValues.set(scope.getFormValues());
    };

    this.fields.set(scope.getFormFields());
    syncValues();

    const cleanups = [
      scope.onFormReady((nextFields) => {
        this.fields.set(nextFields);
        syncValues();
      }),
      scope.onFieldValueChange(() => {
        syncValues();
        this.changeCount.update((n) => n + 1);
      }),
    ];
    this.destroyRef.onDestroy(() => cleanups.forEach((cleanup) => cleanup()));
  }
}
