<script setup lang="ts">
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { useZoom, MarqueeZoom, ZoomMode } from '@embedpdf/plugin-zoom/vue';
import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/vue';
import { TilingLayer } from '@embedpdf/plugin-tiling/vue';
import { ZoomIn, ZoomOut, RotateCcw, Scan } from 'lucide-vue-next';

const props = defineProps<{
  documentId: string;
}>();

const { provides: zoom, state } = useZoom(() => props.documentId);
</script>

<template>
  <div
    class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
  >
    <!-- Toolbar -->
    <div
      v-if="zoom"
      class="flex flex-wrap items-center gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
    >
      <span class="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
        Zoom
      </span>
      <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
      <div class="flex items-center gap-1.5">
        <button
          @click="zoom.zoomOut()"
          class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
          title="Zoom Out"
        >
          <ZoomOut :size="16" />
        </button>
        <div
          class="min-w-[56px] rounded-md bg-white px-2 py-1 text-center shadow-sm ring-1 ring-gray-300 dark:bg-gray-700 dark:ring-gray-600"
        >
          <span class="font-mono text-sm font-medium text-gray-700 dark:text-gray-200">
            {{ Math.round(state.currentZoomLevel * 100) }}%
          </span>
        </div>
        <button
          @click="zoom.zoomIn()"
          class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
          title="Zoom In"
        >
          <ZoomIn :size="16" />
        </button>
        <button
          @click="zoom.requestZoom(ZoomMode.FitPage)"
          class="ml-1 inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
          title="Reset Zoom to Fit Page"
        >
          <RotateCcw :size="14" />
          <span class="hidden sm:inline">Reset</span>
        </button>
      </div>
      <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
      <button
        @click="zoom.toggleMarqueeZoom()"
        :class="[
          'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium shadow-sm transition-all',
          state.isMarqueeZoomActive
            ? 'bg-blue-500 text-white ring-1 ring-blue-600'
            : 'bg-white text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600',
        ]"
        title="Toggle Area Zoom"
      >
        <Scan :size="14" />
        <span class="hidden sm:inline">Area Zoom</span>
      </button>
      <span
        v-if="state.isMarqueeZoomActive"
        class="hidden animate-pulse text-xs text-blue-600 sm:inline dark:text-blue-400"
      >
        Click and drag to zoom into area
      </span>
    </div>

    <!-- PDF Viewer Area -->
    <div class="relative h-[400px] sm:h-[500px]">
      <Viewport :document-id="documentId" class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
        <Scroller :document-id="documentId">
          <template #default="{ page }">
            <PagePointerProvider :document-id="documentId" :page-index="page.pageIndex">
              <RenderLayer :document-id="documentId" :page-index="page.pageIndex" :scale="1" />
              <TilingLayer :document-id="documentId" :page-index="page.pageIndex" />
              <MarqueeZoom :document-id="documentId" :page-index="page.pageIndex" />
            </PagePointerProvider>
          </template>
        </Scroller>
      </Viewport>
    </div>
  </div>
</template>
