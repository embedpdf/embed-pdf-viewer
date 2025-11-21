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
        <template #default="{ pluginsReady, activeDocumentId, documentStates }">
          <div v-if="!pluginsReady" class="flex h-full items-center justify-center">
            <LoadingSpinner message="Initializing plugins..." />
          </div>

          <div v-else class="flex h-full flex-col">
            <TabBar :documentStates="documentStates" :activeDocumentId="activeDocumentId" />

            <ViewerToolbar
              v-if="activeDocumentId"
              :documentId="activeDocumentId"
              :onToggleSearch="() => toggleSidebar(activeDocumentId, 'search')"
              :onToggleThumbnails="() => toggleSidebar(activeDocumentId, 'thumbnails')"
              :isSearchOpen="getSidebarState(activeDocumentId).search"
              :isThumbnailsOpen="getSidebarState(activeDocumentId).thumbnails"
              :mode="getToolbarMode(activeDocumentId)"
              :onModeChange="(mode: ViewMode) => setToolbarMode(activeDocumentId, mode)"
            />

            <!-- Document Content Area -->
            <div
              v-if="activeDocumentId"
              id="document-content"
              class="flex flex-1 overflow-hidden bg-white"
            >
              <!-- Thumbnails Sidebar - Left -->
              <ThumbnailsSidebar
                v-if="getSidebarState(activeDocumentId).thumbnails"
                :documentId="activeDocumentId"
                :onClose="() => toggleSidebar(activeDocumentId, 'thumbnails')"
              />

              <!-- Main Viewer -->
              <div class="flex-1 overflow-hidden">
                <DocumentContent
                  :documentId="activeDocumentId"
                  v-slot="{ documentState, isLoading, isError, isLoaded }"
                >
                  <div v-if="isLoading" class="flex h-full items-center justify-center">
                    <LoadingSpinner message="Loading document..." />
                  </div>
                  <DocumentPasswordPrompt v-else-if="isError" :documentState="documentState" />
                  <div v-else-if="isLoaded" class="relative h-full w-full">
                    <GlobalPointerProvider :documentId="activeDocumentId">
                      <Viewport class="bg-gray-100" :documentId="activeDocumentId">
                        <Scroller :documentId="activeDocumentId" v-slot="{ page }">
                          <Rotate
                            :documentId="activeDocumentId"
                            :pageIndex="page.pageIndex"
                            style="background-color: #fff"
                          >
                            <PagePointerProvider
                              :documentId="activeDocumentId"
                              :pageIndex="page.pageIndex"
                            >
                              <RenderLayer
                                :documentId="activeDocumentId"
                                :pageIndex="page.pageIndex"
                                :scale="1"
                                style="pointer-events: none"
                              />
                              <TilingLayer
                                :documentId="activeDocumentId"
                                :pageIndex="page.pageIndex"
                                style="pointer-events: none"
                              />
                              <SearchLayer
                                :documentId="activeDocumentId"
                                :pageIndex="page.pageIndex"
                              />
                              <MarqueeZoom
                                :documentId="activeDocumentId"
                                :pageIndex="page.pageIndex"
                              />
                              <MarqueeCapture
                                :documentId="activeDocumentId"
                                :pageIndex="page.pageIndex"
                              />
                              <SelectionLayer
                                :documentId="activeDocumentId"
                                :pageIndex="page.pageIndex"
                              />
                              <RedactionLayer
                                :documentId="activeDocumentId"
                                :pageIndex="page.pageIndex"
                              />
                              <AnnotationLayer
                                :documentId="activeDocumentId"
                                :pageIndex="page.pageIndex"
                              />
                            </PagePointerProvider>
                          </Rotate>
                        </Scroller>
                        <!-- Page Controls -->
                        <PageControls :documentId="activeDocumentId" />
                      </Viewport>
                    </GlobalPointerProvider>
                  </div>
                </DocumentContent>
              </div>

              <!-- Search Sidebar - Right -->
              <SearchSidebar
                v-if="getSidebarState(activeDocumentId).search"
                :documentId="activeDocumentId"
                :onClose="() => toggleSidebar(activeDocumentId, 'search')"
              />
            </div>
          </div>
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
import TabBar from '../components/TabBar.vue';
import type { ViewMode } from '../components/ViewerToolbar.vue';
import ViewerToolbar from '../components/ViewerToolbar.vue';
import LoadingSpinner from '../components/LoadingSpinner.vue';
import DocumentPasswordPrompt from '../components/DocumentPasswordPrompt.vue';
import SearchSidebar from '../components/SearchSidebar.vue';
import ThumbnailsSidebar from '../components/ThumbnailsSidebar.vue';
import PageControls from '../components/PageControls.vue';
import NavigationBar from '../components/NavigationBar.vue';
import { ConsoleLogger } from '@embedpdf/models';

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
  registry
    ?.getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id)
    ?.provides()
    ?.openDocumentUrl({ url: 'https://snippet.embedpdf.com/ebook.pdf' })
    .toPromise();
};
</script>
