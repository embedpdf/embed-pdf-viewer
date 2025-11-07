<script setup lang="ts">
import { ref } from 'vue';
import { usePdfiumEngine } from '@embedpdf/engines/vue';
import { EmbedPDF } from '@embedpdf/core/vue';
import { createPluginRegistration, PluginRegistry } from '@embedpdf/core';
import {
  DocumentManagerPluginPackage,
  DocumentContext,
  DocumentContent,
  DocumentManagerPlugin,
} from '@embedpdf/plugin-document-manager/vue';
import { Viewport, ViewportPluginPackage } from '@embedpdf/plugin-viewport/vue';
import { Scroller, ScrollPluginPackage, ScrollStrategy } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/vue';
import { TilingLayer, TilingPluginPackage } from '@embedpdf/plugin-tiling/vue';
import { SelectionLayer, SelectionPluginPackage } from '@embedpdf/plugin-selection/vue';
import {
  InteractionManagerPluginPackage,
  GlobalPointerProvider,
  PagePointerProvider,
} from '@embedpdf/plugin-interaction-manager/vue';
import { RotatePluginPackage } from '@embedpdf/plugin-rotate/vue';
import { Rotate } from '@embedpdf/plugin-rotate/vue';
import { FullscreenPluginPackage } from '@embedpdf/plugin-fullscreen/vue';
import { ZoomMode, ZoomPluginPackage, MarqueeZoom } from '@embedpdf/plugin-zoom/vue';
import { PanPluginPackage } from '@embedpdf/plugin-pan/vue';
import { ExportPluginPackage } from '@embedpdf/plugin-export/vue';
import { SpreadPluginPackage, SpreadMode } from '@embedpdf/plugin-spread/vue';
import { PrintPluginPackage } from '@embedpdf/plugin-print/vue';
import { SearchPluginPackage, SearchLayer } from '@embedpdf/plugin-search/vue';
import { ThumbnailPluginPackage } from '@embedpdf/plugin-thumbnail/vue';
import { RedactionPluginPackage, RedactionLayer } from '@embedpdf/plugin-redaction/vue';
import { HistoryPluginPackage } from '@embedpdf/plugin-history/vue';
import { CapturePluginPackage, MarqueeCapture } from '@embedpdf/plugin-capture/vue';
import {
  AnnotationPluginPackage,
  AnnotationLayer,
  AnnotationPlugin,
} from '@embedpdf/plugin-annotation/vue';
import type { AnnotationTool } from '@embedpdf/plugin-annotation/vue';
import { PdfAnnotationSubtype } from '@embedpdf/models';
import type { PdfStampAnnoObject } from '@embedpdf/models';

import TabBar from './TabBar.vue';
import Toolbar from './Toolbar.vue';
import DrawerProvider from './drawer-system/DrawerProvider.vue';
import Drawer from './drawer-system/Drawer.vue';
import Search from './Search.vue';
import Sidebar from './Sidebar.vue';
import RedactionSelectionMenu from './RedactionSelectionMenu.vue';
import AnnotationSelectionMenu from './AnnotationSelectionMenu.vue';
import PageControls from './PageControls.vue';

// Function to get drawer components with current documentId
const getDrawerComponents = (documentId: string | null) => [
  {
    id: 'search',
    component: Search,
    icon: 'mdi-magnify',
    label: 'Search',
    position: 'right' as const,
    props: documentId ? { documentId } : {},
  },
  {
    id: 'sidebar',
    component: Sidebar,
    icon: 'mdi-dock-left',
    label: 'Sidebar',
    position: 'left' as const,
    props: documentId ? { documentId } : {},
  },
];

const { engine, isLoading: engineLoading, error: engineError } = usePdfiumEngine();

const handleInitialized = async (registry: PluginRegistry) => {
  const annotation = registry.getPlugin<AnnotationPlugin>('annotation')?.provides();
  annotation?.addTool<AnnotationTool<PdfStampAnnoObject>>({
    id: 'stampApproved',
    name: 'Stamp Approved',
    interaction: {
      exclusive: false,
      cursor: 'crosshair',
    },
    matchScore: () => 0,
    defaults: {
      type: PdfAnnotationSubtype.STAMP,
      imageSrc:
        'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Eo_circle_green_checkmark.svg/512px-Eo_circle_green_checkmark.svg.png',
      imageSize: { width: 20, height: 20 },
    },
  });

  // Open initial document
  registry
    .getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id)
    ?.provides()
    ?.openDocumentUrl({ url: 'https://snippet.embedpdf.com/ebook.pdf' })
    .toPromise();
};
</script>

<template>
  <!-- Loading state -->
  <div v-if="engineLoading" class="d-flex fill-height align-center justify-center">
    <div class="text-center">
      <v-progress-circular indeterminate color="primary" size="64"></v-progress-circular>
      <div class="text-body-1 text-medium-emphasis mt-4">Loading PDF engine...</div>
    </div>
  </div>

  <!-- Error state -->
  <div v-else-if="engineError" class="d-flex fill-height align-center justify-center">
    <v-alert type="error" variant="tonal" class="ma-4">
      <v-alert-title>Error</v-alert-title>
      {{ engineError.message }}
    </v-alert>
  </div>

  <!-- Main application -->
  <div v-else-if="engine" class="fill-height">
    <EmbedPDF
      :engine="engine"
      :on-initialized="handleInitialized"
      :plugins="[
        createPluginRegistration(DocumentManagerPluginPackage),
        createPluginRegistration(ViewportPluginPackage, {
          viewportGap: 10,
        }),
        createPluginRegistration(ScrollPluginPackage, {
          defaultStrategy: ScrollStrategy.Vertical,
        }),
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
          imagePadding: 10,
          labelHeight: 25,
        }),
      ]"
    >
      <template #default="{ pluginsReady, registry }">
        <div v-if="!pluginsReady" class="d-flex fill-height align-center justify-center">
          <div class="text-center">
            <v-progress-circular indeterminate color="primary" size="48"></v-progress-circular>
            <div class="text-body-1 text-medium-emphasis mt-4">Loading plugins...</div>
          </div>
        </div>

        <DocumentContext v-else>
          <template #default="{ documentStates, activeDocumentId, actions }">
            <DrawerProvider :components="getDrawerComponents(activeDocumentId)">
              <div class="fill-height d-flex flex-column" id="pdf-app-layout">
                <!-- Tab Bar -->
                <TabBar
                  :documentStates="documentStates"
                  :activeDocumentId="activeDocumentId"
                  :onSelect="actions.select"
                  :onClose="actions.close"
                />

                <v-layout class="fill-height" style="flex: 1">
                  <!-- Toolbar -->
                  <Toolbar v-if="activeDocumentId" :documentId="activeDocumentId" />

                  <!-- Left Drawer -->
                  <Drawer position="left" />

                  <!-- Main content -->
                  <v-main v-if="activeDocumentId" class="fill-height">
                    <DocumentContent :documentId="activeDocumentId">
                      <template #default="{ documentState, isLoading, isError, isLoaded }">
                        <!-- Loading State -->
                        <div
                          v-if="isLoading"
                          class="d-flex fill-height align-center justify-center"
                        >
                          <div class="text-center">
                            <v-progress-circular
                              indeterminate
                              color="primary"
                              size="48"
                            ></v-progress-circular>
                            <div class="text-body-1 text-medium-emphasis mt-4">
                              Loading document...
                            </div>
                          </div>
                        </div>

                        <!-- Error State -->
                        <div
                          v-else-if="isError"
                          class="d-flex fill-height align-center justify-center"
                        >
                          <v-alert type="error" variant="tonal" class="ma-4">
                            <v-alert-title>Error loading document</v-alert-title>
                            {{ documentState.error ?? 'Unknown error' }}
                          </v-alert>
                        </div>

                        <!-- Loaded State -->
                        <div v-else-if="isLoaded" class="fill-height position-relative">
                          <GlobalPointerProvider :documentId="activeDocumentId">
                            <Viewport
                              :documentId="activeDocumentId"
                              class="fill-height"
                              style="background-color: #f5f5f5; overflow: auto"
                            >
                              <Scroller :documentId="activeDocumentId">
                                <template #default="{ page }">
                                  <Rotate
                                    :documentId="activeDocumentId"
                                    :page-index="page.pageIndex"
                                    style="background-color: white"
                                  >
                                    <PagePointerProvider
                                      :documentId="activeDocumentId"
                                      :page-index="page.pageIndex"
                                      class="position-absolute"
                                    >
                                      <RenderLayer
                                        :documentId="activeDocumentId"
                                        :page-index="page.pageIndex"
                                        :scale="1"
                                        style="pointer-events: none"
                                      />
                                      <TilingLayer
                                        :documentId="activeDocumentId"
                                        :page-index="page.pageIndex"
                                        style="pointer-events: none"
                                      />
                                      <SearchLayer
                                        :documentId="activeDocumentId"
                                        :page-index="page.pageIndex"
                                      />
                                      <MarqueeZoom
                                        :documentId="activeDocumentId"
                                        :page-index="page.pageIndex"
                                      />
                                      <MarqueeCapture
                                        :documentId="activeDocumentId"
                                        :page-index="page.pageIndex"
                                      />
                                      <SelectionLayer
                                        :documentId="activeDocumentId"
                                        :page-index="page.pageIndex"
                                      />
                                      <RedactionLayer
                                        :documentId="activeDocumentId"
                                        :page-index="page.pageIndex"
                                      >
                                        <template
                                          #selection-menu="{
                                            item,
                                            selected,
                                            menuWrapperProps,
                                            rect,
                                          }"
                                        >
                                          <RedactionSelectionMenu
                                            v-if="selected"
                                            :item="item"
                                            :menu-wrapper-props="menuWrapperProps"
                                            :rect="rect"
                                          />
                                        </template>
                                      </RedactionLayer>
                                      <AnnotationLayer
                                        :documentId="activeDocumentId"
                                        :page-index="page.pageIndex"
                                      >
                                        <template
                                          #selection-menu="{
                                            annotation,
                                            selected,
                                            menuWrapperProps,
                                            rect,
                                          }"
                                        >
                                          <AnnotationSelectionMenu
                                            v-if="selected"
                                            :annotation="annotation"
                                            :menu-wrapper-props="menuWrapperProps"
                                            :rect="rect"
                                          />
                                        </template>
                                      </AnnotationLayer>
                                    </PagePointerProvider>
                                  </Rotate>
                                </template>
                              </Scroller>
                              <!-- Page Controls Overlay -->
                              <PageControls :documentId="activeDocumentId" />
                            </Viewport>
                          </GlobalPointerProvider>
                        </div>
                      </template>
                    </DocumentContent>
                  </v-main>

                  <!-- Right Drawer -->
                  <Drawer position="right" />
                </v-layout>
              </div>
            </DrawerProvider>
          </template>
        </DocumentContext>
      </template>
    </EmbedPDF>
  </div>

  <!-- Engine not ready state -->
  <div v-else class="d-flex fill-height align-center justify-center">
    <div class="text-body-1 text-medium-emphasis text-center">Engine not ready</div>
  </div>
</template>

<style scoped>
#pdf-app-layout {
  user-select: none;
}
.flex-1-1-100 {
  flex: 1 1 100%;
}
</style>
