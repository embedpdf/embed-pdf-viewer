<template>
  <div class="flex h-screen flex-1 flex-col overflow-hidden" ref="containerRef">
    <NavigationBar />

    <div class="flex flex-1 select-none flex-col overflow-hidden">
      <div v-if="error" class="flex h-full items-center justify-center">
        <div>Error: {{ error.message }}</div>
      </div>

      <div v-else-if="isLoading || !engine" class="flex h-screen items-center justify-center">
        <LoadingSpinner message="Loading PDF engine..." />
      </div>

      <EmbedPDF
        v-else
        :engine="engine"
        :logger="logger"
        :plugins="plugins"
        :onInitialized="handleInitialized"
      >
        <template #default="{ pluginsReady, registry }">
          <div v-if="!pluginsReady" class="flex h-full items-center justify-center">
            <LoadingSpinner message="Initializing plugins..." />
          </div>

          <SplitViewLayout v-else>
            <template #default="{ context }">
              <div class="flex h-full flex-col">
                <TabBarViewManager
                  :currentView="context.view"
                  :onSelect="(documentId: string) => context.setActiveDocument(documentId)"
                  :onClose="
                    (docId: string) =>
                      registry
                        ?.getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id)
                        ?.provides()
                        ?.closeDocument(docId)
                  "
                  :onOpenFile="() => openFileDialog(registry, context)"
                />

                <ViewerToolbar
                  v-if="context.activeDocumentId"
                  :documentId="context.activeDocumentId"
                  :onToggleSearch="() => toggleSidebar(context.activeDocumentId!, 'search')"
                  :onToggleThumbnails="() => toggleSidebar(context.activeDocumentId!, 'thumbnails')"
                  :isSearchOpen="getSidebarState(context.activeDocumentId).search"
                  :isThumbnailsOpen="getSidebarState(context.activeDocumentId).thumbnails"
                  :mode="getToolbarMode(context.activeDocumentId)"
                  :onModeChange="
                    (mode: ViewMode) => setToolbarMode(context.activeDocumentId!, mode)
                  "
                />

                <!-- Empty State - No Documents -->
                <div
                  v-if="!context.activeDocumentId"
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
                      Get started by opening a PDF document. You can view multiple documents at once
                      using tabs and split views.
                    </p>
                    <button
                      @click="() => openFileDialog(registry, context)"
                      class="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white shadow-lg transition-all hover:bg-indigo-700 hover:shadow-xl"
                    >
                      <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

                <!-- Document Content Area -->
                <div
                  v-if="context.activeDocumentId"
                  :id="context.activeDocumentId"
                  class="flex flex-1 overflow-hidden bg-white"
                >
                  <!-- Thumbnails Sidebar - Left -->
                  <ThumbnailsSidebar
                    v-if="getSidebarState(context.activeDocumentId).thumbnails"
                    :documentId="context.activeDocumentId"
                    :onClose="() => toggleSidebar(context.activeDocumentId!, 'thumbnails')"
                  />

                  <!-- Main Viewer -->
                  <div class="flex-1 overflow-hidden">
                    <DocumentContent
                      :documentId="context.activeDocumentId"
                      v-slot="{ documentState, isLoading, isError, isLoaded }"
                    >
                      <div v-if="isLoading" class="flex h-full items-center justify-center">
                        <LoadingSpinner message="Loading document..." />
                      </div>
                      <DocumentPasswordPrompt v-else-if="isError" :documentState="documentState" />
                      <div v-else-if="isLoaded" class="relative h-full w-full">
                        <GlobalPointerProvider :documentId="context.activeDocumentId">
                          <Viewport class="bg-gray-100" :documentId="context.activeDocumentId">
                            <Scroller :documentId="context.activeDocumentId" v-slot="{ page }">
                              <Rotate
                                :documentId="context.activeDocumentId"
                                :pageIndex="page.pageIndex"
                                style="background-color: #fff"
                              >
                                <PagePointerProvider
                                  :documentId="context.activeDocumentId"
                                  :pageIndex="page.pageIndex"
                                >
                                  <RenderLayer
                                    :documentId="context.activeDocumentId"
                                    :pageIndex="page.pageIndex"
                                    :scale="1"
                                    style="pointer-events: none"
                                  />
                                  <!-- <TilingLayer
                                    :documentId="context.activeDocumentId"
                                    :pageIndex="page.pageIndex"
                                    style="pointer-events: none"
                                  /> -->
                                  <SearchLayer
                                    :documentId="context.activeDocumentId"
                                    :pageIndex="page.pageIndex"
                                  />
                                  <MarqueeZoom
                                    :documentId="context.activeDocumentId"
                                    :pageIndex="page.pageIndex"
                                  />
                                  <MarqueeCapture
                                    :documentId="context.activeDocumentId"
                                    :pageIndex="page.pageIndex"
                                  />
                                  <!-- Selection Layer with slot-based menu -->
                                  <SelectionLayer
                                    :documentId="context.activeDocumentId"
                                    :pageIndex="page.pageIndex"
                                  >
                                    <template #selection-menu="menuProps">
                                      <SelectionSelectionMenu
                                        v-bind="menuProps"
                                        :documentId="context.activeDocumentId!"
                                      />
                                    </template>
                                  </SelectionLayer>

                                  <!-- Redaction Layer with slot-based menu -->
                                  <RedactionLayer
                                    :documentId="context.activeDocumentId"
                                    :pageIndex="page.pageIndex"
                                  >
                                    <template #selection-menu="menuProps">
                                      <RedactionSelectionMenu
                                        v-if="menuProps.selected"
                                        v-bind="menuProps"
                                        :documentId="context.activeDocumentId!"
                                      />
                                    </template>
                                  </RedactionLayer>

                                  <!-- Annotation Layer with slot-based menu -->
                                  <AnnotationLayer
                                    :documentId="context.activeDocumentId"
                                    :pageIndex="page.pageIndex"
                                  >
                                    <template #selection-menu="menuProps">
                                      <AnnotationSelectionMenu
                                        v-if="menuProps.selected"
                                        v-bind="menuProps"
                                        :documentId="context.activeDocumentId!"
                                      />
                                    </template>
                                  </AnnotationLayer>
                                </PagePointerProvider>
                              </Rotate>
                            </Scroller>
                            <!-- Page Controls -->
                            <PageControls :documentId="context.activeDocumentId" />
                          </Viewport>
                        </GlobalPointerProvider>
                      </div>
                    </DocumentContent>
                  </div>

                  <!-- Search Sidebar - Right -->
                  <SearchSidebar
                    v-if="getSidebarState(context.activeDocumentId).search"
                    :documentId="context.activeDocumentId"
                    :onClose="() => toggleSidebar(context.activeDocumentId!, 'search')"
                  />
                </div>
              </div>
            </template>
          </SplitViewLayout>
        </template>
      </EmbedPDF>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { EmbedPDF } from '@embedpdf/core/vue';
import { usePdfiumEngine } from '@embedpdf/engines/vue';
import { createPluginRegistration, type PluginRegistry } from '@embedpdf/core';
import { ViewportPluginPackage, Viewport } from '@embedpdf/plugin-viewport/vue';
import { ScrollPluginPackage, ScrollStrategy, Scroller } from '@embedpdf/plugin-scroll/vue';
import {
  DocumentManagerPluginPackage,
  DocumentContent,
  DocumentManagerPlugin,
  useOpenDocuments,
} from '@embedpdf/plugin-document-manager/vue';
import {
  InteractionManagerPluginPackage,
  GlobalPointerProvider,
  PagePointerProvider,
} from '@embedpdf/plugin-interaction-manager/vue';
import { ZoomMode, ZoomPluginPackage, MarqueeZoom } from '@embedpdf/plugin-zoom/vue';
import { PanPluginPackage } from '@embedpdf/plugin-pan/vue';
import { SpreadMode, SpreadPluginPackage } from '@embedpdf/plugin-spread/vue';
import { Rotate, RotatePluginPackage } from '@embedpdf/plugin-rotate/vue';
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/vue';
import { TilingLayer, TilingPluginPackage } from '@embedpdf/plugin-tiling/vue';
import { RedactionLayer, RedactionPluginPackage } from '@embedpdf/plugin-redaction/vue';
import { ExportPluginPackage } from '@embedpdf/plugin-export/vue';
import { PrintPluginPackage } from '@embedpdf/plugin-print/vue';
import { SelectionLayer, SelectionPluginPackage } from '@embedpdf/plugin-selection/vue';
import { SearchLayer, SearchPluginPackage } from '@embedpdf/plugin-search/vue';
import { ThumbnailPluginPackage } from '@embedpdf/plugin-thumbnail/vue';
import { CapturePluginPackage, MarqueeCapture } from '@embedpdf/plugin-capture/vue';
import { FullscreenPluginPackage } from '@embedpdf/plugin-fullscreen/vue';
import { HistoryPluginPackage } from '@embedpdf/plugin-history/vue';
import { AnnotationPluginPackage, AnnotationLayer } from '@embedpdf/plugin-annotation/vue';
import {
  ViewManagerPlugin,
  ViewManagerPluginPackage,
  type ViewContextRenderProps,
} from '@embedpdf/plugin-view-manager/vue';
import TabBarViewManager from '../components/TabBarViewManager.vue';
import type { ViewMode } from '../components/ViewerToolbar.vue';
import ViewerToolbar from '../components/ViewerToolbar.vue';
import LoadingSpinner from '../components/LoadingSpinner.vue';
import DocumentPasswordPrompt from '../components/DocumentPasswordPrompt.vue';
import SearchSidebar from '../components/SearchSidebar.vue';
import ThumbnailsSidebar from '../components/ThumbnailsSidebar.vue';
import PageControls from '../components/PageControls.vue';
import NavigationBar from '../components/NavigationBar.vue';
import SplitViewLayout from '../components/SplitViewLayout.vue';
import AnnotationSelectionMenu from '../components/AnnotationSelectionMenu.vue';
import { ConsoleLogger } from '@embedpdf/models';
import SelectionSelectionMenu from '../components/SelectionSelectionMenu.vue';
import RedactionSelectionMenu from '../components/RedactionSelectionMenu.vue';

const logger = new ConsoleLogger();

const containerRef = ref<HTMLDivElement | null>(null);
const { engine, isLoading, error } = usePdfiumEngine({
  logger,
});

// Track sidebar state per document
type SidebarState = {
  search: boolean;
  thumbnails: boolean;
};

const sidebarStates = ref<Record<string, SidebarState>>({});
const toolbarModes = ref<Record<string, ViewMode>>({});

const plugins = computed(() => [
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
  createPluginRegistration(RedactionPluginPackage),
  createPluginRegistration(CapturePluginPackage),
  createPluginRegistration(HistoryPluginPackage),
  createPluginRegistration(AnnotationPluginPackage),
  createPluginRegistration(FullscreenPluginPackage),
  createPluginRegistration(ThumbnailPluginPackage, {
    width: 120,
    paddingY: 10,
  }),
  createPluginRegistration(ViewManagerPluginPackage, {
    defaultViewCount: 1,
  }),
]);

const toggleSidebar = (documentId: string, sidebar: keyof SidebarState) => {
  sidebarStates.value = {
    ...sidebarStates.value,
    [documentId]: {
      ...(sidebarStates.value[documentId] || { search: false, thumbnails: false }),
      [sidebar]: !sidebarStates.value[documentId]?.[sidebar],
    },
  };
};

const getSidebarState = (documentId: string): SidebarState => {
  return sidebarStates.value[documentId] || { search: false, thumbnails: false };
};

const getToolbarMode = (documentId: string): ViewMode => {
  return toolbarModes.value[documentId] || 'view';
};

const setToolbarMode = (documentId: string, mode: ViewMode) => {
  toolbarModes.value = {
    ...toolbarModes.value,
    [documentId]: mode,
  };
};

const handleInitialized = async (registry: PluginRegistry) => {
  // Load default PDF URL on initialization
  const document = await registry
    ?.getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id)
    ?.provides()
    ?.openDocumentUrl({ url: 'https://snippet.embedpdf.com/ebook.pdf' })
    .toPromise();

  if (!document) return;

  const viewManager = registry?.getPlugin<ViewManagerPlugin>(ViewManagerPlugin.id)?.provides();
  if (!viewManager) return;

  const views = viewManager.getAllViews();
  if (views.length > 0 && views[0]) {
    const firstViewId = views[0].id;
    viewManager.addDocumentToView(firstViewId, document.documentId);
    viewManager.setViewActiveDocument(firstViewId, document.documentId);
  }
};

const openFileDialog = (registry: PluginRegistry | null, context: ViewContextRenderProps) => {
  const openTask = registry
    ?.getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id)
    ?.provides()
    ?.openFileDialog();
  openTask?.wait(
    (result) => {
      context.addDocument(result.documentId);
      context.setActiveDocument(result.documentId);
    },
    (error) => {
      console.error('Open file failed:', error);
    },
  );
};
</script>
