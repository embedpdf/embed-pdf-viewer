<script lang="ts">
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { useExport } from '@embedpdf/plugin-export/svelte';
  import { SelectionLayer } from '@embedpdf/plugin-selection/svelte';
  import { AnnotationLayer } from '@embedpdf/plugin-annotation/svelte';
  import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/svelte';
  import { useZoom } from '@embedpdf/plugin-zoom/svelte';
  import { useFormCapability } from '@embedpdf/plugin-form/svelte';
  import { Download, Trash2, Wand2, ZoomIn, ZoomOut } from 'lucide-svelte';

  interface Props {
    documentId: string;
  }

  let { documentId }: Props = $props();

  const zoom = useZoom(() => documentId);
  const exportApi = useExport(() => documentId);
  const formCapability = useFormCapability();

  function handleFillDemoData() {
    const scope = formCapability.provides?.forDocument(documentId);
    scope?.setFormValues({
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
    });
  }

  function handleClearForm() {
    const scope = formCapability.provides?.forDocument(documentId);
    scope?.setFormValues({
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
    });
  }
</script>

<div
  class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
  style="user-select: none"
>
  <div
    class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
  >
    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onclick={handleFillDemoData}
        class="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
      >
        <Wand2 size={16} />
        Auto Fill Data
      </button>

      <button
        type="button"
        onclick={handleClearForm}
        class="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        <Trash2 size={16} />
        Clear Form
      </button>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          onclick={() => zoom.provides?.zoomOut()}
          disabled={!zoom.provides}
          class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
          title="Zoom Out"
        >
          <ZoomOut size={16} />
        </button>

        <button
          type="button"
          onclick={() => zoom.provides?.zoomIn()}
          disabled={!zoom.provides}
          class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
          title="Zoom In"
        >
          <ZoomIn size={16} />
        </button>
      </div>

      <button
        type="button"
        onclick={() => exportApi.provides?.download()}
        disabled={!exportApi.provides}
        class="inline-flex items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Download size={16} />
        Download PDF
      </button>
    </div>
  </div>

  <div class="relative h-[420px] sm:h-[550px]">
    {#snippet renderPage(page: RenderPageProps)}
      <PagePointerProvider {documentId} pageIndex={page.pageIndex}>
        <RenderLayer {documentId} pageIndex={page.pageIndex} style="pointer-events: none;" />
        <SelectionLayer {documentId} pageIndex={page.pageIndex} />
        <AnnotationLayer {documentId} pageIndex={page.pageIndex} />
      </PagePointerProvider>
    {/snippet}

    <Viewport {documentId} class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
      <Scroller {documentId} {renderPage} />
    </Viewport>
  </div>
</div>
