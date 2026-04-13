<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    PDFViewer,
    type EmbedPdfContainer,
    type PluginRegistry,
    type FormPlugin,
    type FormFieldInfo,
  } from '@embedpdf/svelte-pdf-viewer';

  interface Props {
    themePreference?: 'light' | 'dark';
  }

  let { themePreference = 'light' }: Props = $props();

  const documentId = 'form-doc';

  let container = $state<EmbedPdfContainer | null>(null);
  let formValues = $state<Record<string, string>>({});
  let fields = $state<FormFieldInfo[]>([]);
  let changeCount = $state(0);
  let cleanups: (() => void)[] = [];

  const handleInit = (c: EmbedPdfContainer) => {
    container = c;
  };

  const handleReady = (registry: PluginRegistry) => {
    const formPlugin = registry.getPlugin<FormPlugin>('form')?.provides();
    const formScope = formPlugin?.forDocument(documentId);

    if (!formScope) return;

    const syncValues = () => {
      formValues = formScope.getFormValues();
    };

    fields = formScope.getFormFields();
    syncValues();

    cleanups.push(
      formScope.onFormReady((nextFields) => {
        fields = nextFields;
        syncValues();
      }),
    );

    cleanups.push(
      formScope.onFieldValueChange(() => {
        syncValues();
        changeCount += 1;
      }),
    );
  };

  $effect(() => {
    container?.setTheme({ preference: themePreference });
  });

  onDestroy(() => {
    cleanups.forEach((cleanup) => cleanup());
  });

  const filledFieldCount = $derived(
    Object.values(formValues).filter((value) => value !== '' && value !== 'Off').length,
  );
</script>

<div class="flex flex-col gap-4">
  <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
    <div
      class="h-[500px] overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600"
    >
      <PDFViewer
        oninit={handleInit}
        onready={handleReady}
        config={{
          theme: { preference: themePreference },
          documentManager: {
            initialDocuments: [
              {
                url: '/form.pdf',
                documentId,
              },
            ],
          },
          export: {
            defaultFileName: 'filled-form.pdf',
          },
        }}
        style="width: 100%; height: 100%;"
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
            {fields.length}
          </div>
        </div>
        <div class="border-x border-gray-200 px-4 py-3 dark:border-gray-700">
          <div class="text-gray-500 dark:text-gray-400">Filled</div>
          <div class="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
            {filledFieldCount}
          </div>
        </div>
        <div class="px-4 py-3">
          <div class="text-gray-500 dark:text-gray-400">Changes</div>
          <div class="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
            {changeCount}
          </div>
        </div>
      </div>

      <div class="max-h-[340px] overflow-auto p-4">
        {#if Object.keys(formValues).length > 0}
          <pre class="text-xs text-gray-800 dark:text-gray-300">{JSON.stringify(
              formValues,
              null,
              2,
            )}</pre>
        {:else}
          <p class="text-sm italic text-gray-400 dark:text-gray-500">Waiting for form fields...</p>
        {/if}
      </div>
    </div>
  </div>
</div>
