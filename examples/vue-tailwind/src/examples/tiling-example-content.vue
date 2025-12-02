<script setup lang="ts">
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { useZoom, ZoomMode } from '@embedpdf/plugin-zoom/vue';
import { TilingLayer } from '@embedpdf/plugin-tiling/vue';
import { ZoomIn, ZoomOut, RotateCcw, Grid3X3 } from 'lucide-vue-next';

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
      <div class="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
        <Grid3X3 :size="14" />
        <span class="hidden uppercase tracking-wide sm:inline">Tiling Demo</span>
      </div>
      <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
      <div class="flex items-center gap-1.5">
        <button
          @click="zoom.zoomOut"
          title="Zoom Out"
          class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
        >
          <ZoomOut :size="16" />
        </button>
        <div
          class="min-w-[56px] rounded-md bg-white px-2 py-1 text-center shadow-sm ring-1 ring-gray-300 dark:bg-gray-700 dark:ring-gray-600"
        >
          <span class="font-mono text-sm font-medium text-gray-700 dark:text-gray-300">
            {{ Math.round((state?.currentZoomLevel ?? 1) * 100) }}%
          </span>
        </div>
        <button
          @click="zoom?.zoomIn()"
          title="Zoom In"
          class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
        >
          <ZoomIn :size="16" />
        </button>
        <button
          @click="zoom?.requestZoom && zoom.requestZoom(ZoomMode.FitPage)"
          class="ml-1 inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
          title="Reset Zoom"
        >
          <RotateCcw :size="14" />
          <span class="hidden sm:inline">Reset</span>
        </button>
      </div>
      <span class="hidden text-xs text-gray-600 lg:inline dark:text-gray-300">
        Zoom in to see tiling in action — renders high-res tiles on demand
      </span>
    </div>

    <!-- PDF Viewer Area -->
    <div class="relative h-[400px] sm:h-[500px]">
      <Viewport :document-id="documentId" class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
        <Scroller :document-id="documentId">
          <template #default="{ page }">
            <div
              :style="{
                width: page.width + 'px',
                height: page.height + 'px',
                position: 'relative',
              }"
            >
              <RenderLayer :document-id="documentId" :page-index="page.pageIndex" :scale="1" />
              <TilingLayer :document-id="documentId" :page-index="page.pageIndex" />
            </div>
          </template>
        </Scroller>
      </Viewport>
    </div>
  </div>
</template>
