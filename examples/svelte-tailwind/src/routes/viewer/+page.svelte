<script lang="ts">
  import { EmbedPDF } from '@embedpdf/core/svelte';
  import { usePdfiumEngine } from '@embedpdf/engines/svelte';
  import { createPluginRegistration, PluginRegistry } from '@embedpdf/core';
  import { ViewportPluginPackage, Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { ScrollPluginPackage, ScrollStrategy, Scroller } from '@embedpdf/plugin-scroll/svelte';
  import {
    DocumentManagerPluginPackage,
    DocumentContent,
    DocumentManagerPlugin,
  } from '@embedpdf/plugin-document-manager/svelte';
  import {
    InteractionManagerPluginPackage,
    GlobalPointerProvider,
    PagePointerProvider,
  } from '@embedpdf/plugin-interaction-manager/svelte';
  import { ZoomMode, ZoomPluginPackage, MarqueeZoom } from '@embedpdf/plugin-zoom/svelte';
  import { PanPluginPackage } from '@embedpdf/plugin-pan/svelte';
  import { SpreadMode, SpreadPluginPackage } from '@embedpdf/plugin-spread/svelte';
  import { Rotate, RotatePluginPackage } from '@embedpdf/plugin-rotate/svelte';
  import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/svelte';
  import { TilingLayer, TilingPluginPackage } from '@embedpdf/plugin-tiling/svelte';
  import { ExportPluginPackage } from '@embedpdf/plugin-export/svelte';
  import { PrintPluginPackage } from '@embedpdf/plugin-print/svelte';
  import { SelectionLayer, SelectionPluginPackage } from '@embedpdf/plugin-selection/svelte';
  import { SearchLayer, SearchPluginPackage } from '@embedpdf/plugin-search/svelte';
  import { ThumbnailPluginPackage } from '@embedpdf/plugin-thumbnail/svelte';
  import { CapturePluginPackage, MarqueeCapture } from '@embedpdf/plugin-capture/svelte';
  import { FullscreenPluginPackage } from '@embedpdf/plugin-fullscreen/svelte';
  import { HistoryPluginPackage } from '@embedpdf/plugin-history/svelte';
  import {
    ViewManagerPluginPackage,
    ViewManagerPlugin,
  } from '@embedpdf/plugin-view-manager/svelte';
  import TabBarViewManager from '$lib/components/TabBarViewManager.svelte';
  import ViewerToolbar from '$lib/components/ViewerToolbar.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import DocumentPasswordPrompt from '$lib/components/DocumentPasswordPrompt.svelte';
  import SearchSidebar from '$lib/components/SearchSidebar.svelte';
  import ThumbnailsSidebar from '$lib/components/ThumbnailsSidebar.svelte';
  import PageControls from '$lib/components/PageControls.svelte';
  import NavigationBar from '$lib/components/NavigationBar.svelte';
  import SplitViewLayout from '$lib/components/SplitViewLayout.svelte';
  import { ConsoleLogger } from '@embedpdf/models';

  const logger = new ConsoleLogger();

  const pdfEngine = usePdfiumEngine({ logger });

  // Track sidebar state per document
  type SidebarState = {
    search: boolean;
    thumbnails: boolean;
  };

  let sidebarStates = $state<Record<string, SidebarState>>({});

  const plugins = $derived.by(() => [
    createPluginRegistration(ViewportPluginPackage, {
      viewportGap: 10,
    }),
    createPluginRegistration(ScrollPluginPackage, {
      defaultStrategy: ScrollStrategy.Vertical,
    }),
    createPluginRegistration(DocumentManagerPluginPackage),
    createPluginRegistration(InteractionManagerPluginPackage),
    createPluginRegistration(ZoomPluginPackage, {
      defaultZoomLevel: ZoomMode.FitPage,
    }),
    createPluginRegistration(PanPluginPackage),
    createPluginRegistration(SpreadPluginPackage, {
      defaultSpreadMode: SpreadMode.None,
    }),
    createPluginRegistration(RotatePluginPackage),
    createPluginRegistration(ExportPluginPackage),
    createPluginRegistration(PrintPluginPackage),
    createPluginRegistration(RenderPluginPackage),
    createPluginRegistration(TilingPluginPackage, {
      tileSize: 768,
      overlapPx: 2.5,
      extraRings: 0,
    }),
    createPluginRegistration(SelectionPluginPackage),
    createPluginRegistration(SearchPluginPackage),
    createPluginRegistration(CapturePluginPackage),
    createPluginRegistration(HistoryPluginPackage),
    createPluginRegistration(FullscreenPluginPackage, {
      targetElement: '#document-content',
    }),
    createPluginRegistration(ThumbnailPluginPackage, {
      width: 120,
      paddingY: 10,
    }),
    createPluginRegistration(ViewManagerPluginPackage, {
      defaultViewCount: 1,
    }),
  ]);

  const toggleSidebar = (documentId: string, sidebar: keyof SidebarState) => {
    sidebarStates = {
      ...sidebarStates,
      [documentId]: {
        ...(sidebarStates[documentId] || { search: false, thumbnails: false }),
        [sidebar]: !sidebarStates[documentId]?.[sidebar],
      },
    };
  };

  const getSidebarState = (documentId: string): SidebarState => {
    return sidebarStates[documentId] || { search: false, thumbnails: false };
  };

  const handleInitialized = async (registry: PluginRegistry) => {
    // Load default PDF URL on initialization
    const document = await registry
      .getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id)
      ?.provides()
      ?.openDocumentUrl({ url: 'https://snippet.embedpdf.com/ebook.pdf' })
      .toPromise();

    if (!document) return;

    const viewManager = registry.getPlugin<ViewManagerPlugin>(ViewManagerPlugin.id)?.provides();
    if (!viewManager) return;

    const views = viewManager.getAllViews();
    if (views.length > 0 && views[0]) {
      const firstViewId = views[0].id;
      viewManager.addDocumentToView(firstViewId, document.documentId);
      viewManager.setViewActiveDocument(firstViewId, document.documentId);
    }
  };

  const openFileDialog = (registry: PluginRegistry, context: any) => {
    const openTask = registry
      .getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id)
      ?.provides()
      ?.openFileDialog();
    openTask?.wait(
      (result: any) => {
        context.addDocument(result.documentId);
        context.setActiveDocument(result.documentId);
      },
      (error: any) => {
        console.error('Open file failed:', error);
      },
    );
  };
</script>

{#if pdfEngine.error}
  <div class="flex h-screen items-center justify-center">
    <div>Error: {pdfEngine.error.message}</div>
  </div>
{:else if pdfEngine.isLoading || !pdfEngine.engine}
  <div class="flex h-screen items-center justify-center">
    <LoadingSpinner message="Loading PDF engine..." />
  </div>
{:else}
  <div class="flex h-screen flex-1 flex-col overflow-hidden">
    <NavigationBar />

    <div class="flex flex-1 select-none flex-col overflow-hidden">
      <EmbedPDF engine={pdfEngine.engine} {logger} {plugins} onInitialized={handleInitialized}>
        {#snippet children({ pluginsReady, registry })}
          {#if !pluginsReady}
            <div class="flex h-full items-center justify-center">
              <LoadingSpinner message="Initializing plugins..." />
            </div>
          {:else}
            <SplitViewLayout>
              {#snippet renderView({ context })}
                <div class="flex h-full flex-col">
                  <TabBarViewManager
                    currentView={context.view}
                    onSelect={(documentId) => context.setActiveDocument(documentId)}
                    onClose={(docId) =>
                      registry
                        ?.getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id)
                        ?.provides()
                        ?.closeDocument(docId)}
                    onOpenFile={() => openFileDialog(registry, context)}
                  />

                  {#if context.activeDocumentId}
                    <ViewerToolbar
                      documentId={context.activeDocumentId}
                      onToggleSearch={() => toggleSidebar(context.activeDocumentId, 'search')}
                      onToggleThumbnails={() =>
                        toggleSidebar(context.activeDocumentId, 'thumbnails')}
                      isSearchOpen={getSidebarState(context.activeDocumentId).search}
                      isThumbnailsOpen={getSidebarState(context.activeDocumentId).thumbnails}
                    />
                  {/if}

                  <!-- Empty State - No Documents -->
                  {#if !context.activeDocumentId}
                    <div
                      class="flex flex-1 items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100"
                    >
                      <div class="max-w-md text-center">
                        <div class="mb-6 flex justify-center">
                          <div class="rounded-full bg-indigo-100 p-6">
                            <svg
                              class="h-16 w-16 text-indigo-600"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="1.5"
                                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                              />
                              <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="1.5"
                                d="M9 13h6m-6 4h6"
                              />
                            </svg>
                          </div>
                        </div>
                        <h2 class="mb-3 text-2xl font-bold text-gray-900">No Documents Open</h2>
                        <p class="mb-8 text-gray-600">
                          Get started by opening a PDF document. You can view multiple documents at
                          once using tabs and split views.
                        </p>
                        <button
                          onclick={() => openFileDialog(registry, context)}
                          class="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white shadow-lg transition-all hover:bg-indigo-700 hover:shadow-xl"
                        >
                          <svg
                            class="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M12 4v16m8-8H4"
                            />
                          </svg>
                          Open PDF Document
                        </button>
                        <div class="mt-6 text-sm text-gray-500">Supported format: PDF</div>
                      </div>
                    </div>
                  {/if}

                  <!-- Document Content Area -->
                  {#if context.activeDocumentId}
                    <div id="document-content" class="flex flex-1 overflow-hidden bg-white">
                      <!-- Thumbnails Sidebar - Left -->
                      {#if getSidebarState(context.activeDocumentId).thumbnails}
                        <ThumbnailsSidebar
                          documentId={context.activeDocumentId}
                          onClose={() => toggleSidebar(context.activeDocumentId, 'thumbnails')}
                        />
                      {/if}

                      <!-- Main Viewer -->
                      <div class="flex-1 overflow-hidden">
                        <DocumentContent documentId={context.activeDocumentId}>
                          {#snippet children({ documentState, isLoading, isError, isLoaded })}
                            {#if isLoading}
                              <div class="flex h-full items-center justify-center">
                                <LoadingSpinner message="Loading document..." />
                              </div>
                            {:else if isError}
                              <DocumentPasswordPrompt {documentState} />
                            {:else if isLoaded}
                              <div class="relative h-full w-full">
                                <GlobalPointerProvider documentId={context.activeDocumentId}>
                                  <Viewport
                                    class="bg-gray-100"
                                    documentId={context.activeDocumentId}
                                  >
                                    <Scroller documentId={context.activeDocumentId}>
                                      {#snippet children(page)}
                                        <Rotate
                                          documentId={context.activeDocumentId}
                                          pageIndex={page.pageIndex}
                                          style="background-color: #fff"
                                        >
                                          <PagePointerProvider
                                            documentId={context.activeDocumentId}
                                            pageIndex={page.pageIndex}
                                          >
                                            <RenderLayer
                                              documentId={context.activeDocumentId}
                                              pageIndex={page.pageIndex}
                                              scale={1}
                                              style="pointer-events: none"
                                            />
                                            <SearchLayer
                                              documentId={context.activeDocumentId}
                                              pageIndex={page.pageIndex}
                                            />
                                            <MarqueeZoom
                                              documentId={context.activeDocumentId}
                                              pageIndex={page.pageIndex}
                                            />
                                            <MarqueeCapture
                                              documentId={context.activeDocumentId}
                                              pageIndex={page.pageIndex}
                                            />
                                            <SelectionLayer
                                              documentId={context.activeDocumentId}
                                              pageIndex={page.pageIndex}
                                            />
                                          </PagePointerProvider>
                                        </Rotate>
                                      {/snippet}
                                    </Scroller>
                                    <!-- Page Controls -->
                                    <PageControls documentId={context.activeDocumentId} />
                                  </Viewport>
                                </GlobalPointerProvider>
                              </div>
                            {/if}
                          {/snippet}
                        </DocumentContent>
                      </div>

                      <!-- Search Sidebar - Right -->
                      {#if getSidebarState(context.activeDocumentId).search}
                        <SearchSidebar
                          documentId={context.activeDocumentId}
                          onClose={() => toggleSidebar(context.activeDocumentId, 'search')}
                        />
                      {/if}
                    </div>
                  {/if}
                </div>
              {/snippet}
            </SplitViewLayout>
          {/if}
        {/snippet}
      </EmbedPDF>
    </div>
  </div>
{/if}
