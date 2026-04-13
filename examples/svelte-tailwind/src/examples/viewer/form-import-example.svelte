<script lang="ts">
  import {
    PDFViewer,
    type EmbedPdfContainer,
    type PluginRegistry,
    type ExportPlugin,
    type ExportScope,
    type FormPlugin,
    type FormScope,
  } from '@embedpdf/svelte-pdf-viewer';
  import { Check, Download, Loader2, Trash2, Wand2 } from 'lucide-svelte';

  interface Props {
    themePreference?: 'light' | 'dark';
  }

  let { themePreference = 'light' }: Props = $props();

  const documentId = 'form-doc';

  const demoData: Record<string, string> = {
    First_Name: 'Jane',
    Last_Name: 'Doe',
    Email_Address: 'jane.doe@example.com',
    Phone_Number: '+1 (555) 123-4567',
    Home_Address: '123 Main Street',
    City: 'San Francisco',
    State: 'CA',
    Postal_Code: '94102',
    Department: 'Design',
    Employment_Type: 'Contract',
    Office_Location: 'San Francisco',
    Start_Date: '2026-04-01',
    Programming_Languages: 'TypeScript, Rust, Go',
    Framework_Tools: 'React, Node.js, Docker',
    Comments: 'I would like to have a standing desk and a dual monitor setup.',
    Equipment_Laptop: 'Yes',
    Equipment_Monitor: 'Yes',
    Equipment_Keyboard: 'Yes',
    Equipment_Desk: 'Yes',
    Access_Repository: 'Yes',
    Access_Cloud: 'Yes',
    Access_Internal: 'Yes',
    Access_VPN: 'Yes',
    Terms: 'Yes',
    Preferred_Shift: '4f803c06-508d-4232-bd84-82452b6561f1',
    Work_Arrangement: 'd43ec6d3-9e8c-403f-98d7-e2c818070ac4',
  };

  const emptyData: Record<string, string> = {
    First_Name: '',
    Last_Name: '',
    Email_Address: '',
    Phone_Number: '',
    Home_Address: '',
    City: '',
    State: '',
    Postal_Code: '',
    Department: 'Engineering',
    Employment_Type: 'Full-time',
    Office_Location: 'New York',
    Start_Date: '',
    Programming_Languages: '',
    Framework_Tools: '',
    Comments: '',
    Equipment_Laptop: 'Off',
    Equipment_Monitor: 'Off',
    Equipment_Keyboard: 'Off',
    Equipment_Desk: 'Off',
    Access_Repository: 'Off',
    Access_Cloud: 'Off',
    Access_Internal: 'Off',
    Access_VPN: 'Off',
    Terms: 'Off',
    Preferred_Shift: '1a5963ac-8d1e-4c83-9a8b-da53700e46c1',
    Work_Arrangement: 'e424be12-71f7-4458-b1a3-a71a0b100729',
  };

  let container = $state<EmbedPdfContainer | null>(null);
  let formScope = $state<FormScope | null>(null);
  let exportScope = $state<ExportScope | null>(null);
  let isMutating = $state(false);
  let saveStatus = $state<'idle' | 'success'>('idle');

  const handleInit = (c: EmbedPdfContainer) => {
    container = c;
  };

  const handleReady = (registry: PluginRegistry) => {
    const formPlugin = registry.getPlugin<FormPlugin>('form')?.provides();
    const exportPlugin = registry.getPlugin<ExportPlugin>('export')?.provides();

    formScope = formPlugin?.forDocument(documentId) ?? null;
    exportScope = exportPlugin?.forDocument(documentId) ?? null;
  };

  $effect(() => {
    container?.setTheme({ preference: themePreference });
  });

  const applyFormValues = async (values: Record<string, string>) => {
    if (!formScope) return;

    isMutating = true;
    await formScope.setFormValues(values).toPromise();
    isMutating = false;
  };

  const handleDownload = () => {
    exportScope?.download();
  };

  const handleSaveCopy = async () => {
    if (!exportScope) return;

    isMutating = true;

    const arrayBuffer = await exportScope.saveAsCopy().toPromise();
    const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
    const file = new File([blob], 'filled-form.pdf');

    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log(`Prepared ${file.size} bytes for upload.`);
    saveStatus = 'success';
    setTimeout(() => (saveStatus = 'idle'), 2500);
    isMutating = false;
  };
</script>

<div class="flex flex-col gap-4">
  <div
    class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
  >
    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onclick={() => applyFormValues(demoData)}
        disabled={isMutating}
        class="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {#if isMutating}
          <Loader2 size={16} class="animate-spin" />
        {:else}
          <Wand2 size={16} />
        {/if}
        Auto Fill Data
      </button>

      <button
        type="button"
        onclick={() => applyFormValues(emptyData)}
        disabled={isMutating}
        class="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
      >
        <Trash2 size={16} />
        Clear Form
      </button>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onclick={handleDownload}
        disabled={isMutating}
        class="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
      >
        <Download size={16} />
        Download PDF
      </button>

      <button
        type="button"
        onclick={handleSaveCopy}
        disabled={isMutating}
        class="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {#if isMutating}
          <Loader2 size={16} class="animate-spin" />
        {:else if saveStatus === 'success'}
          <Check size={16} />
        {:else}
          <Download size={16} />
        {/if}
        {isMutating ? 'Working...' : saveStatus === 'success' ? 'Saved!' : 'Save Copy'}
      </button>
    </div>
  </div>

  <div
    class="h-[500px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600"
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
</div>
