<script setup lang="ts">
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { useZoom } from '@embedpdf/plugin-zoom/vue';
import { TilingLayer } from '@embedpdf/plugin-tiling/vue';

const { provides: zoom } = useZoom();
</script>

<template>
  <div style="height: 500px">
    <div class="flex h-full flex-col">
      <div
        v-if="zoom"
        class="mb-4 mt-4 flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
      >
        <button
          @click="zoom.zoomOut"
          title="Zoom Out"
          class="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-colors duration-150 hover:bg-gray-50"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M5 12h14" />
          </svg>
        </button>
        <button
          @click="zoom.zoomIn"
          title="Zoom In"
          class="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-colors duration-150 hover:bg-gray-50"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
      <div class="relative flex w-full flex-1 overflow-hidden">
        <Viewport class="flex-grow bg-gray-100">
          <Scroller>
            <template #default="{ page }">
              <div
                :style="{
                  width: page.width + 'px',
                  height: page.height + 'px',
                  position: 'relative',
                }"
              >
                <RenderLayer :page-index="page.pageIndex" :scale="1" />
                <TilingLayer :page-index="page.pageIndex" :scale="page.scale" />
              </div>
            </template>
          </Scroller>
        </Viewport>
      </div>
    </div>
  </div>
</template>
