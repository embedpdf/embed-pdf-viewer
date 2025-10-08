<script setup lang="ts">
import { ref } from 'vue';
import { usePdfiumEngine } from '@embedpdf/engines/vue';
import { EmbedPDF } from '@embedpdf/core/vue';
import { createPluginRegistration, PluginRegistry } from '@embedpdf/core';
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
import { RedactionPluginPackage, RedactionLayer } from '@embedpdf/plugin-redaction/vue';
import {
  AnnotationLayer,
  AnnotationPluginPackage,
  AnnotationPlugin,
} from '@embedpdf/plugin-annotation/vue';
import type { AnnotationTool } from '@embedpdf/plugin-annotation/vue';
import { PdfAnnotationSubtype } from '@embedpdf/models';
import type { PdfStampAnnoObject } from '@embedpdf/models';
import Toolbar from './Toolbar.vue';
import PageControls from './PageControls.vue';
import RedactionSelectionMenu from './RedactionSelectionMenu.vue';
import AnnotationSelectionMenu from './AnnotationSelectionMenu.vue';

import Search from './Search.vue';
import Sidebar from './Sidebar.vue';

const leftDrawerOpen = ref(false);
const rightDrawerOpen = ref(false);

const toggleLeftDrawer = () => {
  leftDrawerOpen.value = !leftDrawerOpen.value;
  if (leftDrawerOpen.value && rightDrawerOpen.value) {
    rightDrawerOpen.value = false;
  }
};

const toggleRightDrawer = () => {
  rightDrawerOpen.value = !rightDrawerOpen.value;
  if (leftDrawerOpen.value && rightDrawerOpen.value) {
    leftDrawerOpen.value = false;
  }
};

const closeDrawers = () => {
  leftDrawerOpen.value = false;
  rightDrawerOpen.value = false;
};
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
};
</script>

<template>
  <div class="application fit">
    <!-- Loading state -->
    <div v-if="engineLoading" class="state-container column items-center justify-center">
      <q-spinner size="64px" color="primary" />
      <div class="text-subtitle1 text-grey-7 q-mt-md">Loading PDF engine...</div>
    </div>

    <!-- Error state -->
    <div v-else-if="engineError" class="state-container column items-center justify-center">
      <q-banner class="q-ma-md" rounded dense color="negative" text-color="white">
        <div class="text-subtitle1 text-weight-medium">Error</div>
        <div class="text-body2 q-mt-xs">{{ engineError.message }}</div>
      </q-banner>
    </div>

    <!-- Main application -->
    <div v-else-if="engine" class="application__root">
      <div class="application__embed">
        <EmbedPDF
          :engine="engine"
          :on-initialized="handleInitialized"
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
          createPluginRegistration(RedactionPluginPackage),
          createPluginRegistration(AnnotationPluginPackage),
        ]"
        >
          <template #default="{ pluginsReady }">
            <div class="application__shell">
              <Toolbar
                :left-drawer-open="leftDrawerOpen"
                :right-drawer-open="rightDrawerOpen"
                @toggle-left-drawer="toggleLeftDrawer"
                @toggle-right-drawer="toggleRightDrawer"
              />

              <div class="application__body">
                <aside
                  class="application__drawer application__drawer--left"
                  :class="{ 'is-open': leftDrawerOpen }"
                  aria-hidden="true"
                >
                  <Sidebar />
                </aside>

                <div class="application__main">
                  <GlobalPointerProvider class="application__pointer-provider">
                    <Viewport class="application__viewport">
                      <div
                        v-if="!pluginsReady"
                        class="state-container column items-center justify-center"
                      >
                        <q-spinner size="48px" color="primary" />
                        <div class="text-body2 text-grey-7 q-mt-sm">Loading plugins...</div>
                      </div>

                      <Scroller v-else>
                        <template #default="{ page }">
                          <Rotate
                            :key="page.document?.id"
                            :page-size="{ width: page.width, height: page.height }"
                          >
                            <PagePointerProvider
                              :page-index="page.pageIndex"
                              :page-width="page.width"
                              :page-height="page.height"
                              :rotation="page.rotation"
                              :scale="page.scale"
                              class="page-layer"
                            >
                              <RenderLayer
                                :page-index="page.pageIndex"
                                class="layer"
                                style="pointer-events: none"
                              />
                              <TilingLayer
                                :page-index="page.pageIndex"
                                :scale="page.scale"
                                class="layer"
                                style="pointer-events: none"
                              />
                              <MarqueeZoom :page-index="page.pageIndex" :scale="page.scale" />
                              <SearchLayer :page-index="page.pageIndex" :scale="page.scale" />
                              <AnnotationLayer
                                :page-index="page.pageIndex"
                                :scale="page.scale"
                                :page-width="page.width"
                                :page-height="page.height"
                                :rotation="page.rotation"
                              >
                                <template
                                  #selection-menu="{ annotation, selected, menuWrapperProps, rect }"
                                >
                                  <AnnotationSelectionMenu
                                    v-if="selected"
                                    :annotation="annotation"
                                    :menu-wrapper-props="menuWrapperProps"
                                    :rect="rect"
                                  />
                                </template>
                              </AnnotationLayer>
                              <RedactionLayer
                                :page-index="page.pageIndex"
                                :scale="page.scale"
                                :rotation="page.rotation"
                              >
                                <template
                                  #selection-menu="{ item, selected, menuWrapperProps, rect }"
                                >
                                  <RedactionSelectionMenu
                                    v-if="selected"
                                    :item="item"
                                    :menu-wrapper-props="menuWrapperProps"
                                    :rect="rect"
                                  />
                                </template>
                              </RedactionLayer>
                              <SelectionLayer :page-index="page.pageIndex" :scale="page.scale" />
                            </PagePointerProvider>
                          </Rotate>
                        </template>
                      </Scroller>

                      <PageControls />
                    </Viewport>
                  </GlobalPointerProvider>
                </div>

                <aside
                  class="application__drawer application__drawer--right"
                  :class="{ 'is-open': rightDrawerOpen }"
                  aria-hidden="true"
                >
                  <Search />
                </aside>

                <button
                  v-if="leftDrawerOpen || rightDrawerOpen"
                  type="button"
                  class="application__drawer-overlay"
                  aria-label="Close drawers"
                  @click="closeDrawers"
                />
              </div>
            </div>
          </template>
        </EmbedPDF>
      </div>
    </div>

    <!-- Engine not ready state -->
    <div v-else class="state-container column items-center justify-center">
      <div class="text-body1 text-grey-7 text-center">Engine not ready</div>
    </div>
  </div>
</template>

<style scoped>
.application {
  user-select: none;
  height: 100vh;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.application__root {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  height: 100%;
}

.application__embed {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  height: 100%;
}

.application__shell {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: #f5f5f5;
}

.application__body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  position: relative;
  overflow: hidden;
}

.application__drawer {
  width: 300px;
  flex: 0 0 auto;
  background-color: #ffffff;
  border-right: 1px solid var(--q-color-grey-4);
  overflow: auto;
  transform: translateX(-100%);
  transition: transform 0.2s ease;
  z-index: 2;
}

.application__drawer--right {
  border-right: none;
  border-left: 1px solid var(--q-color-grey-4);
  transform: translateX(100%);
}

.application__drawer.is-open {
  transform: translateX(0);
}

.application__drawer-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.25);
  border: none;
  padding: 0;
  margin: 0;
  cursor: pointer;
  z-index: 1;
}

.application__drawer-overlay:focus {
  outline: 2px solid var(--q-color-primary);
}

.application__main {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
}

.application__pointer-provider {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
}

.application__viewport {
  flex: 1 1 auto;
  min-height: 0;
  background-color: #f5f5f5;
  overflow: auto;
  position: relative;
}

.layer {
  pointer-events: none;
}

.page-layer {
  position: absolute;
  top: 0;
  left: 0;
}

.state-container {
  height: 100%;
  display: flex;
}
</style>
