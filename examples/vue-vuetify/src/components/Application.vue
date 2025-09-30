<script setup lang="ts">
import { usePdfiumEngine } from '@embedpdf/engines/vue';
import { EmbedPDF } from '@embedpdf/core/vue';
import { createPluginRegistration } from '@embedpdf/core';
import { LoaderPluginPackage } from '@embedpdf/plugin-loader/vue';
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
import { SpreadPluginPackage } from '@embedpdf/plugin-spread/vue';
import { PrintPluginPackage } from '@embedpdf/plugin-print/vue';
import { SearchPluginPackage, SearchLayer } from '@embedpdf/plugin-search/vue';
import { ThumbnailPluginPackage } from '@embedpdf/plugin-thumbnail/vue';

import Toolbar from './Toolbar.vue';
import DrawerProvider from './drawer-system/DrawerProvider.vue';
import Drawer from './drawer-system/Drawer.vue';
import Search from './Search.vue';
import Sidebar from './Sidebar.vue';

// Define drawer components
const drawerComponents = [
  {
    id: 'search',
    component: Search,
    icon: 'mdi-magnify',
    label: 'Search',
    position: 'right' as const,
  },
  {
    id: 'sidebar',
    component: Sidebar,
    icon: 'mdi-dock-left',
    label: 'Sidebar',
    position: 'left' as const,
  },
];

const { engine, isLoading: engineLoading, error: engineError } = usePdfiumEngine();
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
      :plugins="[
        createPluginRegistration(LoaderPluginPackage, {
          loadingOptions: {
            type: 'url',
            pdfFile: {
              id: 'sample-pdf',
              name: 'embedpdf-ebook.pdf',
              url: 'https://snippet.embedpdf.com/ebook.pdf',
            },
          },
        }),
        createPluginRegistration(ViewportPluginPackage, {
          viewportGap: 10,
        }),
        createPluginRegistration(ScrollPluginPackage, {
          strategy: ScrollStrategy.Vertical,
          pageGap: 10,
        }),
        createPluginRegistration(RenderPluginPackage),
        createPluginRegistration(TilingPluginPackage, {
          tileSize: 768,
          overlapPx: 2.5,
          extraRings: 0,
        }),
        createPluginRegistration(InteractionManagerPluginPackage),
        createPluginRegistration(SelectionPluginPackage),
        createPluginRegistration(RotatePluginPackage),
        createPluginRegistration(FullscreenPluginPackage),
        createPluginRegistration(ZoomPluginPackage, {
          defaultZoomLevel: ZoomMode.FitPage,
        }),
        createPluginRegistration(PanPluginPackage),
        createPluginRegistration(ExportPluginPackage),
        createPluginRegistration(SpreadPluginPackage),
        createPluginRegistration(PrintPluginPackage),
        createPluginRegistration(ThumbnailPluginPackage, {
          imagePadding: 10,
          labelHeight: 25,
        }),
        createPluginRegistration(SearchPluginPackage, {
          flags: [],
          showAllResults: true,
        }),
      ]"
    >
      <template #default="{ pluginsReady }">
        <DrawerProvider :components="drawerComponents">
          <v-layout class="fill-height" id="pdf-app-layout">
            <!-- Toolbar -->
            <Toolbar />

            <!-- Left Drawer -->
            <Drawer position="left" />

            <!-- Main content -->
            <v-main class="fill-height">
              <div class="fill-height position-relative">
                <GlobalPointerProvider>
                  <Viewport class="fill-height" style="background-color: #f5f5f5; overflow: auto">
                    <div
                      v-if="!pluginsReady"
                      class="d-flex fill-height align-center justify-center"
                    >
                      <div class="text-center">
                        <v-progress-circular
                          indeterminate
                          color="primary"
                          size="48"
                        ></v-progress-circular>
                        <div class="text-body-1 text-medium-emphasis mt-4">Loading plugins...</div>
                      </div>
                    </div>
                    <Scroller v-else>
                      <template #default="{ page }">
                        <Rotate :page-size="{ width: page.width, height: page.height }">
                          <PagePointerProvider
                            :page-index="page.pageIndex"
                            :page-width="page.width"
                            :page-height="page.height"
                            :rotation="page.rotation"
                            :scale="page.scale"
                            class="position-absolute"
                          >
                            <RenderLayer
                              :page-index="page.pageIndex"
                              style="pointer-events: none"
                            />
                            <TilingLayer
                              :page-index="page.pageIndex"
                              :scale="page.scale"
                              style="pointer-events: none"
                            />
                            <MarqueeZoom :page-index="page.pageIndex" :scale="page.scale" />
                            <SearchLayer :page-index="page.pageIndex" :scale="page.scale" />
                            <SelectionLayer :page-index="page.pageIndex" :scale="page.scale" />
                          </PagePointerProvider>
                        </Rotate>
                      </template>
                    </Scroller>
                    <!-- Page Controls Overlay -->
                    <PageControls />
                  </Viewport>
                </GlobalPointerProvider>
              </div>
            </v-main>

            <!-- Right Drawer -->
            <Drawer position="right" />
          </v-layout>
        </DrawerProvider>
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
