<script lang="ts">
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/svelte';
  import { SelectionLayer } from '@embedpdf/plugin-selection/svelte';
  import { AnnotationLayer } from '@embedpdf/plugin-annotation/svelte';
  import {
    SignatureDrawPad,
    SignatureTypePad,
    useSignatureEntries,
    useActivePlacement,
    useSignatureCapability,
    useSignatureUpload,
    type SignatureFieldDefinition,
  } from '@embedpdf/plugin-signature/svelte';
  import { PenTool, Type, Upload as UploadIcon, Trash2, X } from 'lucide-svelte';

  interface Props {
    documentId: string;
  }

  let { documentId }: Props = $props();

  const signatureEntries = useSignatureEntries();
  const signatureCapability = useSignatureCapability();
  const activePlacementState = useActivePlacement(() => documentId);

  let creationMode = $state<'draw' | 'type' | null>(null);
  let tempSignature = $state<SignatureFieldDefinition | null>(null);

  const upload = useSignatureUpload({
    onResult: (result) => {
      if (result && signatureCapability.provides) {
        signatureCapability.provides.addEntry({ signature: result });
      }
    },
  });

  const handleSaveTemp = () => {
    if (tempSignature && signatureCapability.provides) {
      signatureCapability.provides.addEntry({ signature: tempSignature });
      creationMode = null;
      tempSignature = null;
    }
  };

  const handleDelete = (e: Event, id: string) => {
    e.stopPropagation();
    signatureCapability.provides?.removeEntry(id);
  };

  const togglePlacement = (id: string) => {
    const scope = signatureCapability.provides?.forDocument(documentId);
    if (activePlacementState.activePlacement?.entryId === id) {
      scope?.deactivatePlacement();
    } else {
      scope?.activateSignaturePlacement(id);
    }
  };
</script>

<div
  class="flex h-[500px] overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
  style="user-select: none"
>
  <aside
    class="flex h-full w-full shrink-0 flex-col border-r border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-900 lg:w-[300px]"
  >
    <div class="p-4 border-b border-gray-200 dark:border-gray-800">
      <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">My Signatures</h2>
      <p class="mt-1 text-xs text-gray-500">
        Create a signature and click it to place on the document.
      </p>

      <div class="flex gap-2 mt-4">
        <button
          onclick={() => (creationMode = 'draw')}
          class="flex flex-1 items-center justify-center gap-1.5 rounded bg-white px-2 py-1.5 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600"
        >
          <PenTool size={14} /> Draw
        </button>
        <button
          onclick={() => (creationMode = 'type')}
          class="flex flex-1 items-center justify-center gap-1.5 rounded bg-white px-2 py-1.5 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600"
        >
          <Type size={14} /> Type
        </button>
        <button
          onclick={upload.openFilePicker}
          class="flex flex-1 items-center justify-center gap-1.5 rounded bg-white px-2 py-1.5 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600"
        >
          <UploadIcon size={14} /> Image
        </button>
        <input
          type="file"
          bind:this={upload.inputRef.current}
          onchange={upload.handleFileInputChange}
          class="hidden"
          accept="image/*"
        />
      </div>
    </div>

    {#if creationMode}
      <div class="p-4 border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
        <div class="flex justify-between items-center mb-2">
          <span class="text-xs font-medium uppercase text-gray-500">New Signature</span>
          <button onclick={() => (creationMode = null)}
            ><X size={14} class="text-gray-400 hover:text-gray-600" /></button
          >
        </div>

        <div
          class="h-[120px] w-full rounded-md border-2 border-dashed border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-900 relative"
        >
          {#if creationMode === 'draw'}
            <SignatureDrawPad onResult={(res) => (tempSignature = res)} strokeColor="blue" />
          {/if}
          {#if creationMode === 'type'}
            <SignatureTypePad onResult={(res) => (tempSignature = res)} color="blue" />
          {/if}
        </div>

        <button
          disabled={!tempSignature}
          onclick={handleSaveTemp}
          class="mt-3 w-full rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Save Signature
        </button>
      </div>
    {/if}

    <div class="flex-1 overflow-y-auto p-4 space-y-3">
      {#each signatureEntries.entries as entry (entry.id)}
        {@const isActive = activePlacementState.activePlacement?.entryId === entry.id}
        <div
          class="relative block w-full rounded-lg border transition-all {isActive
            ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500 dark:border-blue-400 dark:bg-blue-900/20'
            : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600'}"
        >
          <button
            type="button"
            onclick={() => togglePlacement(entry.id)}
            class="block w-full cursor-pointer p-2 text-left"
          >
            <img
              src={entry.signature.previewDataUrl}
              alt="Signature preview"
              class="h-[60px] w-full object-contain"
            />
          </button>
          <button
            type="button"
            onclick={(e) => handleDelete(e, entry.id)}
            class="absolute top-1 right-1 p-1 text-gray-400 hover:text-red-500"
          >
            <Trash2 size={14} />
          </button>
        </div>
      {/each}
      {#if signatureEntries.entries.length === 0 && !creationMode}
        <div class="text-center text-sm text-gray-400 py-8">No signatures yet.</div>
      {/if}
    </div>
  </aside>

  <div class="relative flex-1">
    <Viewport {documentId} class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
      {#snippet renderPage(page: RenderPageProps)}
        <PagePointerProvider {documentId} pageIndex={page.pageIndex}>
          <RenderLayer {documentId} pageIndex={page.pageIndex} style="pointer-events: none;" />
          <SelectionLayer {documentId} pageIndex={page.pageIndex} />
          <AnnotationLayer {documentId} pageIndex={page.pageIndex} />
        </PagePointerProvider>
      {/snippet}
      <Scroller {documentId} {renderPage} />
    </Viewport>
  </div>
</div>
