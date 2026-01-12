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
  import { I18nPluginPackage } from '@embedpdf/plugin-i18n/svelte';
  import {
    englishTranslations,
    germanTranslations,
    spanishTranslations,
    dutchTranslations,
    paramResolvers,
  } from '$lib/config/translations';
  import TabBar from '$lib/components/TabBar.svelte';
  import ViewerToolbar from '$lib/components/ViewerToolbar.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import DocumentPasswordPrompt from '$lib/components/DocumentPasswordPrompt.svelte';
  import SearchSidebar from '$lib/components/SearchSidebar.svelte';
  import ThumbnailsSidebar from '$lib/components/ThumbnailsSidebar.svelte';
  import PageControls from '$lib/components/PageControls.svelte';
  import NavigationBar from '$lib/components/NavigationBar.svelte';
  import { ConsoleLogger } from '@embedpdf/models';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import SelectionSelectionMenu from '$lib/components/SelectionSelectionMenu.svelte';
  import UnlockOwnerOverlay from '$lib/components/UnlockOwnerOverlay.svelte';
  import ViewPermissionsModal from '$lib/components/ViewPermissionsModal.svelte';

  const logger = new ConsoleLogger();

  const pdfEngine = usePdfiumEngine({ logger });

  // Track sidebar state per document
  type SidebarState = {
    search: boolean;
    thumbnails: boolean;
  };

  let sidebarStates = $state<Record<string, SidebarState>>({});

  // Track permissions modal state per document
  let permissionsModalStates = $state<Record<string, boolean>>({});

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
    createPluginRegistration(FullscreenPluginPackage),
    createPluginRegistration(ThumbnailPluginPackage, {
      width: 120,
      paddingY: 10,
    }),
    createPluginRegistration(I18nPluginPackage, {
      defaultLocale: 'en',
      locales: [englishTranslations, germanTranslations, spanishTranslations, dutchTranslations],
      paramResolvers,
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

  const openPermissionsModal = (documentId: string) => {
    permissionsModalStates = { ...permissionsModalStates, [documentId]: true };
  };

  const closePermissionsModal = (documentId: string) => {
    permissionsModalStates = { ...permissionsModalStates, [documentId]: false };
  };

  const isPermissionsModalOpen = (documentId: string): boolean => {
    return permissionsModalStates[documentId] ?? false;
  };

  const handleInitialized = async (registry: PluginRegistry) => {
    registry
      .getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id)
      ?.provides()
      ?.openDocumentUrl({ url: 'https://snippet.embedpdf.com/ebook.pdf' })
      .toPromise();
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
        {#snippet children({ pluginsReady, activeDocumentId, documentStates })}
          {#if !pluginsReady}
            <div class="flex h-full items-center justify-center">
              <LoadingSpinner message="Initializing plugins..." />
            </div>
          {:else}
            <div class="flex h-full flex-col">
              <TabBar {documentStates} {activeDocumentId} />

              {#if activeDocumentId}
                <ViewerToolbar
                  documentId={activeDocumentId}
                  onToggleSearch={() => toggleSidebar(activeDocumentId, 'search')}
                  onToggleThumbnails={() => toggleSidebar(activeDocumentId, 'thumbnails')}
                  isSearchOpen={getSidebarState(activeDocumentId).search}
                  isThumbnailsOpen={getSidebarState(activeDocumentId).thumbnails}
                />
              {/if}

              {#if !activeDocumentId}
                <EmptyState />
              {/if}

              <!-- Document Content Area -->
              {#if activeDocumentId}
                <div id="document-content" class="flex flex-1 overflow-hidden bg-white">
                  <!-- Thumbnails Sidebar - Left -->
                  {#if getSidebarState(activeDocumentId).thumbnails}
                    <ThumbnailsSidebar documentId={activeDocumentId} />
                  {/if}

                  <!-- Main Viewer -->
                  <div class="flex-1 overflow-hidden">
                    <DocumentContent documentId={activeDocumentId}>
                      {#snippet children({ documentState, isLoading, isError, isLoaded })}
                        {#if isLoading}
                          <div class="flex h-full items-center justify-center">
                            <LoadingSpinner message="Loading document..." />
                          </div>
                        {:else if isError}
                          <DocumentPasswordPrompt {documentState} />
                        {:else if isLoaded}
                          <div class="relative h-full w-full">
                            <!-- Security Overlay - Top Right -->
                            <div class="pointer-events-none absolute right-4 top-4 z-50">
                              <UnlockOwnerOverlay
                                documentId={activeDocumentId}
                                onViewPermissions={() => openPermissionsModal(activeDocumentId)}
                              />
                            </div>

                            <!-- Permissions Modal -->
                            <ViewPermissionsModal
                              documentId={activeDocumentId}
                              isOpen={isPermissionsModalOpen(activeDocumentId)}
                              onClose={() => closePermissionsModal(activeDocumentId)}
                            />

                            <GlobalPointerProvider documentId={activeDocumentId}>
                              <Viewport class="bg-gray-100" documentId={activeDocumentId}>
                                <Scroller documentId={activeDocumentId}>
                                  {#snippet renderPage(page)}
                                    <Rotate
                                      documentId={activeDocumentId}
                                      pageIndex={page.pageIndex}
                                      style="background-color: #fff"
                                    >
                                      <PagePointerProvider
                                        documentId={activeDocumentId}
                                        pageIndex={page.pageIndex}
                                      >
                                        <RenderLayer
                                          documentId={activeDocumentId}
                                          pageIndex={page.pageIndex}
                                          scale={1}
                                          style="pointer-events: none"
                                        />
                                        <TilingLayer
                                          documentId={activeDocumentId}
                                          pageIndex={page.pageIndex}
                                          style="pointer-events: none"
                                        />
                                        <SearchLayer
                                          documentId={activeDocumentId}
                                          pageIndex={page.pageIndex}
                                        />
                                        <MarqueeZoom
                                          documentId={activeDocumentId}
                                          pageIndex={page.pageIndex}
                                        />
                                        <MarqueeCapture
                                          documentId={activeDocumentId}
                                          pageIndex={page.pageIndex}
                                        />
                                        <SelectionLayer
                                          documentId={activeDocumentId}
                                          pageIndex={page.pageIndex}
                                        >
                                          {#snippet selectionMenuSnippet(props)}
                                            <SelectionSelectionMenu
                                              {...props}
                                              documentId={activeDocumentId}
                                            />
                                          {/snippet}
                                        </SelectionLayer>
                                      </PagePointerProvider>
                                    </Rotate>
                                  {/snippet}
                                </Scroller>
                                <!-- Page Controls -->
                                <PageControls documentId={activeDocumentId} />
                              </Viewport>
                            </GlobalPointerProvider>
                          </div>
                        {/if}
                      {/snippet}
                    </DocumentContent>
                  </div>

                  <!-- Search Sidebar - Right -->
                  {#if getSidebarState(activeDocumentId).search}
                    <SearchSidebar documentId={activeDocumentId} />
                  {/if}
                </div>
              {/if}
            </div>
          {/if}
        {/snippet}
      </EmbedPDF>
    </div>
  </div>
{/if}
