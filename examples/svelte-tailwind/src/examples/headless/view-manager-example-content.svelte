<script lang="ts">
  import { useDocumentManagerCapability } from '@embedpdf/plugin-document-manager/svelte';
  import {
    ViewContext,
    useAllViews,
    useViewManagerCapability,
  } from '@embedpdf/plugin-view-manager/svelte';
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { Columns2, Plus, FolderOpen } from 'lucide-svelte';
  import ViewManagerExampleTabBar from './view-manager-example-tab-bar.svelte';

  const viewManager = useViewManagerCapability();
  const docManager = useDocumentManagerCapability();
  const views = useAllViews();

  const canAddView = $derived(views.current.length < 3);

  const gridClass = $derived(() => {
    if (views.current.length === 1) return 'grid-cols-1';
    if (views.current.length === 2) return 'grid-cols-2';
    return 'grid-cols-3';
  });

  const handleAddPane = () => {
    viewManager.provides?.createView();
  };

  const handleOpenFile = async (viewId: string) => {
    if (!docManager.provides || !viewManager.provides) return;

    try {
      const task = docManager.provides.openFileDialog();
      const result = await task.toPromise();

      viewManager.provides.addDocumentToView(viewId, result.documentId);
      viewManager.provides.setViewActiveDocument(viewId, result.documentId);
    } catch (e) {
      // User cancelled or error
    }
  };

  const handleRemoveView = (viewId: string) => {
    if (viewManager.provides && views.current.length > 1) {
      viewManager.provides.removeView(viewId);
    }
  };
</script>

<!-- Toolbar -->
<div
  class="flex items-center justify-between gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
>
  <div class="flex items-center gap-2">
    <Columns2 size={14} class="text-gray-500 dark:text-gray-400" />
    <span class="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
      Split View
    </span>
    <div class="mx-1 h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
    <span class="text-xs text-gray-600 dark:text-gray-300">
      {views.current.length}
      {views.current.length === 1 ? 'pane' : 'panes'}
    </span>
  </div>

  <div class="flex items-center gap-1">
    <button
      type="button"
      onclick={handleAddPane}
      disabled={!canAddView}
      class="inline-flex items-center gap-1.5 rounded-md bg-blue-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Plus size={14} />
      <span class="hidden sm:inline">Add Pane</span>
    </button>
  </div>
</div>

<!-- Layout -->
<div class="grid h-[400px] gap-1 bg-gray-100 p-1 sm:h-[500px] dark:bg-gray-800 {gridClass()}">
  {#each views.current as view (view.id)}
    <ViewContext viewId={view.id}>
      {#snippet children({
        documentIds,
        activeDocumentId,
        setActiveDocument,
        focus,
        removeDocument,
      })}
        <div
          class="flex w-full flex-col overflow-hidden bg-white ring-1 ring-inset ring-gray-300 transition-all dark:bg-gray-900 dark:ring-gray-700"
        >
          <!-- Tab Bar -->
          <ViewManagerExampleTabBar
            {documentIds}
            {activeDocumentId}
            canRemoveView={views.current.length > 1}
            onSelect={setActiveDocument}
            onRemoveDocument={removeDocument}
            onOpenFile={() => handleOpenFile(view.id)}
            onRemoveView={() => handleRemoveView(view.id)}
          />

          <!-- Content Area -->
          <div class="relative flex-1 bg-gray-50 dark:bg-gray-800">
            {#if activeDocumentId}
              {#snippet renderPage(page: RenderPageProps)}
                <RenderLayer documentId={activeDocumentId} pageIndex={page.pageIndex} />
              {/snippet}
              <Viewport
                documentId={activeDocumentId}
                class="absolute inset-0 bg-gray-200 dark:bg-gray-800"
              >
                <Scroller documentId={activeDocumentId} {renderPage} />
              </Viewport>
            {:else}
              <div
                class="flex h-full flex-col items-center justify-center gap-2 p-4 text-gray-400 dark:text-gray-500"
              >
                <FolderOpen size={32} strokeWidth={1.5} />
                <p class="text-center text-xs">No document</p>
                <button
                  type="button"
                  onclick={() => handleOpenFile(view.id)}
                  class="mt-1 inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm ring-1 ring-gray-300 transition-colors hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
                >
                  <Plus size={12} />
                  Open File
                </button>
              </div>
            {/if}
          </div>
        </div>
      {/snippet}
    </ViewContext>
  {/each}
</div>
