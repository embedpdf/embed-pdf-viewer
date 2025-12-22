<script lang="ts">
  import {
    DocumentContent,
    useDocumentManagerCapability,
    useOpenDocuments,
  } from '@embedpdf/plugin-document-manager/svelte';
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { TilingLayer } from '@embedpdf/plugin-tiling/svelte';
  import { Loader2, FileText, X, Plus, FolderOpen } from 'lucide-svelte';

  interface Props {
    activeDocumentId: string | null;
  }

  let { activeDocumentId }: Props = $props();

  const docManager = useDocumentManagerCapability();
  const documentStates = useOpenDocuments();

  const handleOpenFile = () => {
    docManager.provides?.openFileDialog();
  };

  const handleSelect = (documentId: string) => {
    docManager.provides?.setActiveDocument(documentId);
  };

  const handleClose = (e: Event, documentId: string) => {
    e.stopPropagation();
    docManager.provides?.closeDocument(documentId);
  };
</script>

<!-- Tab Bar -->
<div
  class="flex items-center gap-1 border-b border-gray-300 bg-gray-50 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-800"
>
  <!-- Tabs -->
  <div class="flex flex-1 items-center gap-1 overflow-x-auto" role="tablist">
    {#each documentStates.current as doc (doc.id)}
      <div
        onclick={() => handleSelect(doc.id)}
        onkeydown={(e) => e.key === 'Enter' && handleSelect(doc.id)}
        role="tab"
        tabindex={0}
        aria-selected={activeDocumentId === doc.id}
        class={[
          'group relative flex min-w-[100px] max-w-[180px] cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all',
          activeDocumentId === doc.id
            ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:ring-gray-600'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200',
        ].join(' ')}
      >
        <FileText size={14} class="flex-shrink-0" />
        <span class="min-w-0 flex-1 truncate">
          {doc.name ?? `Document ${doc.id.slice(0, 6)}`}
        </span>
        <button
          type="button"
          onclick={(e) => handleClose(e, doc.id)}
          aria-label={`Close ${doc.name ?? 'document'}`}
          class={[
            'flex-shrink-0 rounded p-0.5 transition-all hover:bg-gray-200 dark:hover:bg-gray-600',
            activeDocumentId === doc.id
              ? 'opacity-60 hover:opacity-100'
              : 'opacity-0 hover:!opacity-100 group-hover:opacity-60',
          ].join(' ')}
        >
          <X size={12} />
        </button>
      </div>
    {/each}
  </div>

  <!-- Add button -->
  <button
    type="button"
    onclick={handleOpenFile}
    class="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-200"
    aria-label="Open File"
    title="Open File"
  >
    <Plus size={16} />
  </button>
</div>

<!-- Document Content -->
{#if activeDocumentId}
  <DocumentContent documentId={activeDocumentId}>
    {#snippet children(documentContent)}
      {#if documentContent.isLoading}
        <div class="flex h-[400px] items-center justify-center sm:h-[500px]">
          <div class="flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <Loader2 size={20} class="animate-spin" />
            <span class="text-sm">Loading document...</span>
          </div>
        </div>
      {:else if documentContent.isLoaded}
        {#snippet renderPage(page: RenderPageProps)}
          <div
            style:width="{page.width}px"
            style:height="{page.height}px"
            style:position="relative"
          >
            <RenderLayer documentId={activeDocumentId} pageIndex={page.pageIndex} />
            <TilingLayer documentId={activeDocumentId} pageIndex={page.pageIndex} />
          </div>
        {/snippet}
        <div class="relative h-[400px] sm:h-[500px]">
          <Viewport
            documentId={activeDocumentId}
            class="absolute inset-0 bg-gray-200 dark:bg-gray-800"
          >
            <Scroller documentId={activeDocumentId} {renderPage} />
          </Viewport>
        </div>
      {/if}
    {/snippet}
  </DocumentContent>
{:else}
  <!-- Empty State -->
  <div
    class="flex h-[400px] flex-col items-center justify-center gap-3 text-gray-400 sm:h-[500px] dark:text-gray-500"
  >
    <FolderOpen size={40} strokeWidth={1.5} />
    <div class="text-center">
      <p class="text-sm font-medium text-gray-500 dark:text-gray-400">No document open</p>
      <p class="mt-1 text-xs">Click the + button or drop a file to open</p>
    </div>
    <button
      type="button"
      onclick={handleOpenFile}
      class="mt-2 inline-flex items-center gap-2 rounded-md bg-blue-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-600"
    >
      <Plus size={14} />
      Open File
    </button>
  </div>
{/if}
