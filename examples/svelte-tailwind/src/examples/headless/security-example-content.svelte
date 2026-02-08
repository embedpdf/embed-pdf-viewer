<script lang="ts">
  import { useDocumentPermissions } from '@embedpdf/core/svelte';
  import {
    DocumentContent,
    useDocumentManagerCapability,
    useOpenDocuments,
  } from '@embedpdf/plugin-document-manager/svelte';
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/svelte';
  import { PrintFrame, usePrintCapability } from '@embedpdf/plugin-print/svelte';
  import { SelectionLayer, useSelectionCapability } from '@embedpdf/plugin-selection/svelte';
  import { Shield, ShieldCheck, ShieldOff, Printer, Copy, FileText } from 'lucide-svelte';

  interface Props {
    activeDocumentId: string | null;
  }

  let { activeDocumentId }: Props = $props();

  const docManager = useDocumentManagerCapability();
  const documents = useOpenDocuments();
  const printCap = usePrintCapability();
  const selectionCap = useSelectionCapability();

  const perms = $derived(useDocumentPermissions(() => activeDocumentId || ''));

  // Custom names for demo documents
  const getDocumentName = (docName: string | undefined, index: number) => {
    const names = ['Full Access', 'Print Disabled', 'Read-Only'];
    return names[index] || docName || `Document ${index + 1}`;
  };

  const handlePrint = () => {
    if (perms.canPrint && printCap.provides) {
      printCap.provides.print();
    }
  };

  const handleCopy = () => {
    if (perms.canCopyContents && selectionCap.provides) {
      selectionCap.provides.copyToClipboard();
    }
  };
</script>

<div
  class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
>
  <PrintFrame />

  <!-- Tab Bar -->
  <div
    class="flex items-center gap-1 border-b border-gray-200 bg-gray-50 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-800"
  >
    {#each documents.current as doc, index}
      {@const isActive = activeDocumentId === doc.id}
      {@const name = getDocumentName(doc.name, index)}
      <button
        onclick={() => docManager.provides?.setActiveDocument(doc.id)}
        class={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
          isActive
            ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200 dark:bg-gray-700 dark:text-white dark:ring-gray-600'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200'
        }`}
      >
        <FileText size={12} />
        {name}
      </button>
    {/each}
  </div>

  <!-- Toolbar -->
  <div
    class="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2 dark:border-gray-700 dark:bg-gray-900"
  >
    <div class="text-xs text-gray-500 dark:text-gray-400">
      Switch tabs to see how permissions affect the toolbar
    </div>

    <div class="flex items-center gap-2">
      <button
        disabled={!perms.canCopyContents}
        onclick={handleCopy}
        title={perms.canCopyContents
          ? 'Copy selected text'
          : 'Copying is disabled for this document'}
        class={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          perms.canCopyContents
            ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            : 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600'
        }`}
      >
        <Copy size={12} />
        Copy
      </button>

      <button
        disabled={!perms.canPrint}
        onclick={handlePrint}
        title={perms.canPrint ? 'Print document' : 'Printing is disabled for this document'}
        class={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors ${
          perms.canPrint
            ? 'bg-blue-600 hover:bg-blue-700'
            : 'cursor-not-allowed bg-gray-400 dark:bg-gray-600'
        }`}
      >
        <Printer size={12} />
        Print
      </button>
    </div>
  </div>

  <!-- PDF Viewer -->
  <div class="relative h-[450px]" style="user-select: none;">
    {#if activeDocumentId}
      <DocumentContent documentId={activeDocumentId}>
        {#snippet children({ isLoaded })}
          {#if isLoaded}
            <!-- Permission Status Panel -->
            <div
              class="absolute right-4 top-4 z-10 w-56 rounded-lg border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-gray-700 dark:bg-gray-800/95"
            >
              <div
                class="mb-2 flex items-center gap-2 border-b border-gray-200 pb-2 text-sm font-semibold text-gray-900 dark:border-gray-700 dark:text-white"
              >
                <Shield size={14} class="text-blue-500" />
                Effective Permissions
              </div>
              <div class="space-y-0.5 text-xs">
                <!-- Print -->
                <div class="flex items-center justify-between py-1">
                  <span class="text-gray-600 dark:text-gray-400">Print</span>
                  {#if perms.canPrint}
                    <span
                      class="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400"
                    >
                      <ShieldCheck size={12} /> Allowed
                    </span>
                  {:else}
                    <span
                      class="flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400"
                    >
                      <ShieldOff size={12} /> Denied
                    </span>
                  {/if}
                </div>
                <!-- Copy Text -->
                <div class="flex items-center justify-between py-1">
                  <span class="text-gray-600 dark:text-gray-400">Copy Text</span>
                  {#if perms.canCopyContents}
                    <span
                      class="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400"
                    >
                      <ShieldCheck size={12} /> Allowed
                    </span>
                  {:else}
                    <span
                      class="flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400"
                    >
                      <ShieldOff size={12} /> Denied
                    </span>
                  {/if}
                </div>
                <!-- Modify Content -->
                <div class="flex items-center justify-between py-1">
                  <span class="text-gray-600 dark:text-gray-400">Modify Content</span>
                  {#if perms.canModifyContents}
                    <span
                      class="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400"
                    >
                      <ShieldCheck size={12} /> Allowed
                    </span>
                  {:else}
                    <span
                      class="flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400"
                    >
                      <ShieldOff size={12} /> Denied
                    </span>
                  {/if}
                </div>
                <!-- Annotations -->
                <div class="flex items-center justify-between py-1">
                  <span class="text-gray-600 dark:text-gray-400">Annotations</span>
                  {#if perms.canModifyAnnotations}
                    <span
                      class="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400"
                    >
                      <ShieldCheck size={12} /> Allowed
                    </span>
                  {:else}
                    <span
                      class="flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400"
                    >
                      <ShieldOff size={12} /> Denied
                    </span>
                  {/if}
                </div>
              </div>
            </div>

            {#snippet renderPage(page: RenderPageProps)}
              <PagePointerProvider documentId={activeDocumentId} pageIndex={page.pageIndex}>
                <RenderLayer
                  documentId={activeDocumentId}
                  pageIndex={page.pageIndex}
                  class="pointer-events-none"
                />
                <SelectionLayer documentId={activeDocumentId} pageIndex={page.pageIndex} />
              </PagePointerProvider>
            {/snippet}

            <Viewport
              documentId={activeDocumentId}
              class="absolute inset-0 bg-gray-100 dark:bg-gray-800"
            >
              <Scroller documentId={activeDocumentId} {renderPage} />
            </Viewport>
          {/if}
        {/snippet}
      </DocumentContent>
    {:else}
      <div class="flex h-full items-center justify-center text-gray-400">No document loaded</div>
    {/if}
  </div>
</div>
