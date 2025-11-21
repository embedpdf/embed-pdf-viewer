<template>
  <!-- Main Toolbar -->
  <component :is="renderToolbar('top', 'main')" />

  <!-- Secondary Toolbar (annotation/redaction/shapes) -->
  <component :is="renderToolbar('top', 'secondary')" />

  <!-- Document Content Area -->
  <div id="document-content" class="flex flex-1 overflow-hidden bg-white">
    <!-- Left Panels -->
    <component :is="renderPanel('left', 'main')" />

    <!-- Main Viewer -->
    <div class="flex-1 overflow-hidden">
      <DocumentContent :documentId="documentId">
        <template v-slot="{ documentState, isLoading, isError, isLoaded }">
          <div v-if="isLoading" class="flex h-full items-center justify-center">
            <LoadingSpinner message="Loading document..." />
          </div>
          <DocumentPasswordPrompt v-else-if="isError" :documentState="documentState" />
          <div v-else-if="isLoaded" class="relative h-full w-full">
            <GlobalPointerProvider :documentId="documentId">
              <Viewport class="bg-gray-100" :documentId="documentId">
                <Scroller :documentId="documentId" v-slot="{ page }">
                  <Rotate
                    :documentId="documentId"
                    :pageIndex="page.pageIndex"
                    style="background-color: #fff"
                  >
                    <PagePointerProvider :documentId="documentId" :pageIndex="page.pageIndex">
                      <RenderLayer
                        :documentId="documentId"
                        :pageIndex="page.pageIndex"
                        :scale="1"
                        style="pointer-events: none"
                      />
                      <TilingLayer
                        :documentId="documentId"
                        :pageIndex="page.pageIndex"
                        style="pointer-events: none"
                      />
                      <SearchLayer :documentId="documentId" :pageIndex="page.pageIndex" />
                      <MarqueeZoom :documentId="documentId" :pageIndex="page.pageIndex" />
                      <MarqueeCapture :documentId="documentId" :pageIndex="page.pageIndex" />
                      <SelectionLayer :documentId="documentId" :pageIndex="page.pageIndex" />
                      <RedactionLayer :documentId="documentId" :pageIndex="page.pageIndex" />
                      <AnnotationLayer :documentId="documentId" :pageIndex="page.pageIndex" />
                    </PagePointerProvider>
                  </Rotate>
                </Scroller>
                <!-- Page Controls -->
                <PageControls :documentId="documentId" />
              </Viewport>
            </GlobalPointerProvider>
          </div>
        </template>
      </DocumentContent>
    </div>

    <!-- Right Panels -->
    <component :is="renderPanel('right', 'main')" />
  </div>
</template>

<script setup lang="ts">
import { useSchemaRenderer } from '@embedpdf/plugin-ui/vue';
import { DocumentContent } from '@embedpdf/plugin-document-manager/vue';
import {
  GlobalPointerProvider,
  PagePointerProvider,
} from '@embedpdf/plugin-interaction-manager/vue';
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller } from '@embedpdf/plugin-scroll/vue';
import { Rotate } from '@embedpdf/plugin-rotate/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { TilingLayer } from '@embedpdf/plugin-tiling/vue';
import { SearchLayer } from '@embedpdf/plugin-search/vue';
import { MarqueeZoom } from '@embedpdf/plugin-zoom/vue';
import { MarqueeCapture } from '@embedpdf/plugin-capture/vue';
import { SelectionLayer } from '@embedpdf/plugin-selection/vue';
import { RedactionLayer } from '@embedpdf/plugin-redaction/vue';
import { AnnotationLayer } from '@embedpdf/plugin-annotation/vue';
import LoadingSpinner from './LoadingSpinner.vue';
import DocumentPasswordPrompt from './DocumentPasswordPrompt.vue';
import PageControls from './PageControls.vue';

/**
 * Viewer Layout
 *
 * Main layout component that uses useSchemaRenderer to render toolbars and panels.
 * This component replaces the old SchemaToolbarRenderer and SchemaPanelRenderer.
 */

interface Props {
  documentId: string;
}

const props = defineProps<Props>();

const { renderToolbar, renderPanel } = useSchemaRenderer(props.documentId);
</script>
